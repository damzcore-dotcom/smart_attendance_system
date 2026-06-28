const prisma = require('../prismaClient');
const XLSX = require('xlsx');
const { recordAuditLog } = require('./auditLogController');
const { parsePenaltySettings, getJakartaTimeParts } = require('../utils/lateCalculator');
const WIB_OFFSET_H = 7;


const { handleControllerError } = require('../middleware/validate');
// ─── Helper: Calculate Overtime Hours ────────────

const calculateOvertimeHours = (checkIn, checkOut, shiftEndTime) => {
  if (!checkIn || !checkOut) return 0;

  const [endH, endM] = (shiftEndTime || '17:00').split(':').map(Number);
  // Jam selesai shift dibangun EKSPLISIT di WIB (lepas dari TZ proses) pada tanggal checkout.
  const p = getJakartaTimeParts(checkOut);
  const shiftEnd = new Date(Date.UTC(p.year, p.month - 1, p.day, endH - WIB_OFFSET_H, endM, 0, 0));
  const co = new Date(checkOut);

  if (co <= shiftEnd) return 0;

  const hours = (co - shiftEnd) / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100; // Round to 2 decimal
};

// Tentukan jenis hari untuk lembur: WORKDAY | WEEKEND | HOLIDAY.
// HOLIDAY = override kalender HOLIDAY; WORKDAY = hari kerja (atau override WORKDAY); selain itu WEEKEND.
const resolveDayType = (dateObj, workingDaysOfWeek, calendarMap) => {
  const dateStr = new Date(dateObj).toISOString().split('T')[0];
  const ov = calendarMap[dateStr];
  if (ov === 'HOLIDAY') return 'HOLIDAY';
  if (ov === 'WORKDAY') return 'WORKDAY';
  const dow = new Date(dateObj).getUTCDay();
  return workingDaysOfWeek.includes(dow) ? 'WORKDAY' : 'WEEKEND';
};

// ─── Helper: Format Currency ─────────────────────

const formatRupiah = (num) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
};


// ─── Helper: Calculate BPJS and PPh 21 ─────────────

const calculateBPJS = (baseSalary, emp, opts = {}) => {
  const maxBpjsKesSalary = opts.bpjsKesMax || 12000000;
  const maxJpSalary = opts.jpMax || 10022900;

  // applyAll = hitung BPJS untuk semua karyawan walau nomor kartu belum diisi (mode 'ALL').
  const hasBPJSKes = opts.applyAll || !!(emp.bpjsKesehatan && emp.bpjsKesehatan.trim());
  const hasBPJSTk = opts.applyAll || !!(emp.bpjsTk && emp.bpjsTk.trim());

  const bpjsKesSalaryBase = Math.min(baseSalary, maxBpjsKesSalary);
  const jpSalaryBase = Math.min(baseSalary, maxJpSalary);

  const bpjsKesEmployee = hasBPJSKes ? Math.round(bpjsKesSalaryBase * 0.01) : 0;
  const bpjsKesEmployer = hasBPJSKes ? Math.round(bpjsKesSalaryBase * 0.04) : 0;

  const jhtEmployee = hasBPJSTk ? Math.round(baseSalary * 0.02) : 0;
  const jhtEmployer = hasBPJSTk ? Math.round(baseSalary * 0.037) : 0;

  const jpEmployee = hasBPJSTk ? Math.round(jpSalaryBase * 0.01) : 0;
  const jpEmployer = hasBPJSTk ? Math.round(jpSalaryBase * 0.02) : 0;

  const jkkEmployer = hasBPJSTk ? Math.round(baseSalary * 0.0024) : 0;
  const jkmEmployer = hasBPJSTk ? Math.round(baseSalary * 0.003) : 0;

  return {
    bpjsKesEmployee,
    bpjsKesEmployer,
    jhtEmployee,
    jhtEmployer,
    jpEmployee,
    jpEmployer,
    jkkEmployer,
    jkmEmployer,
  };
};

const calculatePPh21 = (baseSalary, proRatedSalary, totalAllowances, overtimePay, bpjsResults, emp, opts = {}) => {
  const bjRate = opts.biayaJabatanRate != null ? opts.biayaJabatanRate : 0.05;
  const bjMax = opts.biayaJabatanMax != null ? opts.biayaJabatanMax : 500000;
  const ptkpMap = {
    'TK/0': 54000000,
    'TK/1': 58500000,
    'TK/2': 63000000,
    'TK/3': 67500000,
    'K/0': 58500000,
    'K/1': 63000000,
    'K/2': 67500000,
    'K/3': 72000000,
  };

  const status = (emp.ptkpStatus || 'TK/0').toUpperCase().replace(/\s+/g, '');
  const ptkp = ptkpMap[status] || ptkpMap['TK/0'];

  const grossIncome = proRatedSalary + totalAllowances + overtimePay +
    bpjsResults.bpjsKesEmployer + bpjsResults.jkkEmployer + bpjsResults.jkmEmployer;

  const biayaJabatan = Math.min(grossIncome * bjRate, bjMax);
  const totalDeductions = biayaJabatan + bpjsResults.jhtEmployee + bpjsResults.jpEmployee;

  const netMonthlyIncome = Math.max(0, grossIncome - totalDeductions);
  const netAnnualIncome = netMonthlyIncome * 12;

  const pkp = Math.max(0, netAnnualIncome - ptkp);
  const roundedPkp = Math.floor(pkp / 1000) * 1000;

  let tax = 0;
  let remainingPkp = roundedPkp;

  if (remainingPkp > 0) {
    const tier1 = Math.min(remainingPkp, 60000000);
    tax += tier1 * 0.05;
    remainingPkp -= tier1;
  }
  if (remainingPkp > 0) {
    const tier2 = Math.min(remainingPkp, 190000000);
    tax += tier2 * 0.15;
    remainingPkp -= tier2;
  }
  if (remainingPkp > 0) {
    const tier3 = Math.min(remainingPkp, 250000000);
    tax += tier3 * 0.25;
    remainingPkp -= tier3;
  }
  if (remainingPkp > 0) {
    const tier4 = Math.min(remainingPkp, 4500000000);
    tax += tier4 * 0.30;
    remainingPkp -= tier4;
  }
  if (remainingPkp > 0) {
    tax += remainingPkp * 0.35;
  }

  const hasNpwp = !!(emp.npwp && emp.npwp.trim());
  if (!hasNpwp) {
    tax = tax * 1.2;
  }

  return Math.round(tax / 12);
};

// ─── Helper: Month Names ─────────────────────────


const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// ─── List Payrolls ───────────────────────────────

const getAll = async (req, res) => {
  try {
    const { year, status } = req.query;
    const where = {};
    if (year) where.period = { startsWith: year };
    if (status && status !== 'All') where.status = status;

    const payrolls = await prisma.payroll.findMany({
      where,
      orderBy: { period: 'desc' },
      include: { _count: { select: { details: true } } },
    });

    res.json({ success: true, data: payrolls });
  } catch (err) {
    handleControllerError(res, err, 'payrollController');
  }
};

// ─── Get Payroll Detail ──────────────────────────

const getById = async (req, res) => {
  try {
    const payroll = await prisma.payroll.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        details: {
          orderBy: { employeeName: 'asc' },
        },
      },
    });

    if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
    res.json({ success: true, data: payroll });
  } catch (err) {
    handleControllerError(res, err, 'payrollController');
  }
};

// ─── Generate Payroll ────────────────────────────

const generate = async (req, res) => {
  try {
    const { period, notes } = req.body; // period = "2026-05"
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ success: false, message: 'Period format must be YYYY-MM' });
    }

    // Check if payroll already exists for this period
    const existing = await prisma.payroll.findUnique({ where: { period } });
    if (existing && existing.status !== 'CANCELLED') {
      return res.status(400).json({ success: false, message: `Payroll for ${period} already exists (Status: ${existing.status})` });
    }

    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const periodName = `${monthNames[month - 1]} ${year}`;

    // Get global settings
    const settingsList = await prisma.settings.findMany();
    const { penaltyRules } = parsePenaltySettings(settingsList);
    const workingDaysSetting = settingsList.find(s => s.key === 'workingDays')?.value || '[1,2,3,4,5]';
    const workingDaysOfWeek = JSON.parse(workingDaysSetting);
    
    // CUT-OFF DATE LOGIC
    const cutoffDateSetting = settingsList.find(s => s.key === 'payrollCutoffDate')?.value || '0';
    const cutoffDay = parseInt(cutoffDateSetting);

    let startDate, endDate;
    if (cutoffDay > 0 && cutoffDay <= 31) {
      // e.g. Cutoff = 25. Period May 2026 is from 26 April to 25 May.
      let prevMonth = month - 1;
      let prevYear = year;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }
      startDate = new Date(Date.UTC(prevYear, prevMonth - 1, cutoffDay + 1));
      endDate = new Date(Date.UTC(year, month - 1, cutoffDay, 23, 59, 59, 999));
    } else {
      // Default: Date range for attendance (1st to end of month)
      startDate = new Date(Date.UTC(year, month - 1, 1));
      endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    }

    // Calculate total working days in period
    let totalWorkingDays = 0;
    // Get payroll config
    const payrollConfigs = await prisma.payrollConfig.findMany();
    const configObj = {};
    payrollConfigs.forEach(c => { configObj[c.key] = c.value; });
    const cfgNum = (k, def) => { const v = parseFloat(configObj[k]); return isNaN(v) ? def : v; };

    // Kalender perusahaan (libur / hari kerja khusus) untuk periode ini → peta tanggal.
    const calendarEntries = await prisma.companyCalendar.findMany({ where: { date: { gte: startDate, lte: endDate } } });
    const calendarMap = {};
    calendarEntries.forEach(c => { calendarMap[new Date(c.date).toISOString().split('T')[0]] = c.type; });

    // Hari kerja: hitung WORKDAY (sesuai workingDays + override WORKDAY), KECUALIKAN libur.
    // → Sabtu ikut terhitung bila workingDays menyertakannya (#4); hari libur tidak dihitung (#4/#6).
    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      if (resolveDayType(new Date(d), workingDaysOfWeek, calendarMap) === 'WORKDAY') totalWorkingDays++;
    }

    // Get global settings to respect "Auto-Calculate Overtime" toggle
    const globalSettings = await prisma.settings.findMany();
    const isGlobalAutoOtEnabled = globalSettings.find(s => s.key === 'autoCalculateOvertime')?.value !== 'false';

    const overtimeEnabled = configObj.overtimeEnabled === 'true';
    const attendancePenaltyEnabled = configObj.attendancePenaltyEnabled !== 'false'; // default true
    const penaltyPerMinute = parseFloat(configObj.penaltyPerMinute) || 0;

    // If globally disabled, force MANUAL mode so it solely relies on SPL inputs
    const overtimeMode = (!isGlobalAutoOtEnabled) ? 'MANUAL' : (configObj.overtimeMode || 'AUTO'); // AUTO or MANUAL

    // ── Konfigurasi lembur ──
    const overtimeFlatMode = configObj.overtimeFlatMode === 'true'; // true = satu multiplier utk semua hari (samaratakan)
    const overtimeFlatMultiplier = cfgNum('overtimeFlatMultiplier', 1.5);
    const otDivisor = cfgNum('overtimeHourlyDivisor', 173) || 173;

    // ── Konfigurasi pajak & iuran (configurable, #6/#2/#9) ──
    const pph21Enabled = configObj.pph21Enabled !== 'false';
    const bpjsOpts = { bpjsKesMax: cfgNum('bpjsKesMaxSalary', 12000000), jpMax: cfgNum('jpMaxSalary', 10022900), applyAll: configObj.bpjsApplyMode === 'ALL' };
    const pphOpts = { biayaJabatanRate: cfgNum('biayaJabatanRate', 0.05), biayaJabatanMax: cfgNum('biayaJabatanMaxMonthly', 500000) };

    // Get overtime rules grouped by day type (WORKDAY/WEEKEND/HOLIDAY)
    const overtimeRules = overtimeEnabled ? await prisma.overtimeRule.findMany({ where: { isActive: true }, orderBy: { hourFrom: 'asc' } }) : [];
    const rulesByType = { WORKDAY: [], WEEKEND: [], HOLIDAY: [] };
    overtimeRules.forEach(r => { const t = (r.dayType || 'WORKDAY').toUpperCase(); if (rulesByType[t]) rulesByType[t].push(r); });

    // Harga lembur 1 hari sesuai JENIS HARI (tiered per jam). Bila flat-mode → satu multiplier untuk semua.
    const priceOvertimeDay = (hours, dayType, baseSalary) => {
      if (hours <= 0 || baseSalary <= 0) return 0;
      const hourlyRate = baseSalary / otDivisor;
      if (overtimeFlatMode) return hours * hourlyRate * overtimeFlatMultiplier;
      const rules = rulesByType[dayType] && rulesByType[dayType].length ? rulesByType[dayType] : null;
      if (!rules) {
        const m = dayType === 'WORKDAY' ? 1.5 : 2; // fallback wajar bila rule jenis hari belum diisi
        return hours * hourlyRate * m;
      }
      let remaining = hours, pay = 0;
      for (const rule of rules) {
        const tier = Math.max(0, rule.hourTo - rule.hourFrom);
        if (tier === 0) continue;
        const applic = Math.min(remaining, tier);
        if (applic > 0) { pay += applic * hourlyRate * rule.multiplier; remaining -= applic; }
        if (remaining <= 0) break;
      }
      if (remaining > 0) pay += remaining * hourlyRate * rules[rules.length - 1].multiplier; // sisa pakai tier terakhir
      return pay;
    };

    // Get employees: ACTIVE + TERMINATED (who have attendance in this period for pending salary)
    const employees = await prisma.employee.findMany({
      where: {
        AND: [
          {
            OR: [
              { status: 'ACTIVE' },
              { attendance: { some: { date: { gte: startDate, lte: endDate } } } }
            ]
          },
          {
            employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] }
          },
          {
            salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] }
          }
        ]
      },
      include: {
        department: true,
        shift: true,
        salary: true,
      },
    });

    // Get all salary components and position allowances
    const components = await prisma.salaryComponent.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const positionAllowances = await prisma.positionAllowance.findMany();

    // Fetch all approved reimbursement claims that haven't been processed in payroll yet
    const approvedClaims = await prisma.reimbursementClaim.findMany({
      where: {
        employeeId: { in: employees.map(e => e.id) },
        status: 'APPROVED',
        payrollId: null
      }
    });

    // PRE-FETCH ALL ATTENDANCE (O(1) lookup map to avoid N+1 queries)
    const allAttendances = await prisma.attendance.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        employeeId: { in: employees.map(e => e.id) }
      }
    });

    const attendanceMap = {};
    allAttendances.forEach(a => {
      if (!attendanceMap[a.employeeId]) attendanceMap[a.employeeId] = [];
      attendanceMap[a.employeeId].push(a);
    });

    const details = [];
    let totalGross = 0, totalDeductions = 0, totalNet = 0, totalOvertimePay = 0;

    for (const emp of employees) {
      const salary = emp.salary;
      if (!salary) continue; // Skip employees without salary config

      // Get attendance for this employee in the period from Memory Map (O(1))
      const attendanceRecords = attendanceMap[emp.id] || [];

      // Calculate claims reimbursement if any
      const empClaims = approvedClaims.filter(c => c.employeeId === emp.id);
      const totalClaimsAmount = empClaims.reduce((sum, c) => sum + c.amount, 0);

      // Calculate attendance stats
      let daysPresent = 0, daysAbsent = 0, daysLate = 0, totalLateMinutes = 0;
      let overtimeHoursTotal = 0;
      let overtimePay = 0; // dihargai PER HARI sesuai jenis hari (#1)

      attendanceRecords.forEach(a => {
        const dayType = resolveDayType(a.date, workingDaysOfWeek, calendarMap);
        const isWorkingDay = dayType === 'WORKDAY';

        if (['PRESENT', 'LATE'].includes(a.status)) {
          daysPresent++;
          if (a.status === 'LATE') {
            daysLate++;
            totalLateMinutes += a.lateMinutes || 0;
          }
        } else if (a.status === 'MANGKIR') {
          // Mangkir → potong sesuai setting keterlambatan (Rule 1: tanpa finger masuk, Rule 3: tanpa pulang)
          const penaltyMinutes = !a.checkIn ? penaltyRules.rule1Minutes : penaltyRules.rule3Minutes;
          totalLateMinutes += penaltyMinutes;
          daysLate++;
        } else if (['ABSENT'].includes(a.status) && isWorkingDay) {
          daysAbsent++;
        }

        // Lembur dihitung & DIHARGAI PER HARI menurut jenis hari (kerja/akhir pekan/libur).
        if (overtimeEnabled && emp.shift) {
          let otHours = 0;
          const isAllIn = emp.salaryCategory && emp.salaryCategory.replace(/\s+/g, '').toUpperCase() === 'ALLIN';

          if (overtimeMode === 'MANUAL' || a.overtimeHours > 0) {
            otHours = a.overtimeHours || 0;
          } else if (a.checkOut && !isAllIn && ['PRESENT', 'LATE'].includes(a.status)) {
            // ALL IN category does not get automatic overtime
            otHours = calculateOvertimeHours(a.checkIn, a.checkOut, emp.shift.endTime);
          }
          if (otHours > 0) {
            overtimeHoursTotal += otHours;
            overtimePay += priceOvertimeDay(otHours, dayType, salary.baseSalary || 0);
          }
        }
        // SAKIT, IZIN, CUTI, HOLIDAY are not penalized
      });

      // Calculate salary
      let baseSalary = salary.baseSalary || 0;
      let proRatedSalary = 0;

      if (salary.salaryType === 'DAILY') {
        // Daily worker: dailyRate × daysPresent
        const rate = salary.dailyRate || 0;
        proRatedSalary = rate * daysPresent;
      } else {
        // Monthly worker: full salary if present enough, pro-rata if absent
        if (emp.status !== 'ACTIVE' && totalWorkingDays > 0) {
          // Gaji Gantung (Resign/Keluar): Dibayar pro-rata sesuai hari kehadiran aktual
          proRatedSalary = (baseSalary / totalWorkingDays) * daysPresent;
        } else if (totalWorkingDays > 0 && daysAbsent > 0) {
          proRatedSalary = baseSalary * (1 - (daysAbsent / totalWorkingDays));
        } else {
          proRatedSalary = baseSalary;
        }
      }

      // Calculate allowances and deductions from components
      const empComponents = salary.components || [];
      const allowanceList = [];
      const deductionList = [];
      
      const applyComponentLogic = (compDefinition, nominalValue) => {
        let finalValue = nominalValue;
        if (compDefinition.type === 'ALLOWANCE') {
          if (compDefinition.calculationType === 'PER_ATTENDANCE') {
            finalValue = nominalValue * daysPresent;
          } else if (compDefinition.calculationType === 'CONDITIONAL') {
            // E.g. perfect attendance condition
            if (daysAbsent > 0 || daysLate > 0) finalValue = 0;
          }
        }
        return finalValue;
      };

      // 1. Calculate Allowances
      if (empComponents.length > 0) {
        empComponents.forEach(c => {
          const compDef = components.find(comp => comp.name === c.name);
          if (!compDef || compDef.type !== 'ALLOWANCE') return;

          let value = c.isFixed !== false ? (c.value || 0) : (baseSalary * (c.value || 0) / 100);
          value = applyComponentLogic(compDef, value);
          allowanceList.push({ name: c.name, value });
        });
      } else {
        components.forEach(c => {
          if (c.type !== 'ALLOWANCE') return;
          let nominalValue = c.isFixed ? c.defaultValue : (baseSalary * c.defaultValue / 100);
          
          if (emp.position) {
            const matrixOverride = positionAllowances.find(pa => pa.position === emp.position && pa.salaryComponentId === c.id);
            if (matrixOverride) {
              nominalValue = matrixOverride.nominal;
            }
          }

          const finalValue = applyComponentLogic(c, nominalValue);
          allowanceList.push({ name: c.name, value: finalValue });
        });
      }

      // 2. Lembur (overtimePay) sudah dihitung PER HARI di loop absensi di atas (sesuai jenis hari).

      // 3. Calculate BPJS and PPh 21 (configurable)
      const bpjsResults = calculateBPJS(baseSalary, emp, bpjsOpts);
      const totalAllowancesExcludingReimbursement = allowanceList.reduce((sum, a) => sum + a.value, 0);
      const pph21Value = pph21Enabled
        ? calculatePPh21(baseSalary, proRatedSalary, totalAllowancesExcludingReimbursement, overtimePay, bpjsResults, emp, pphOpts)
        : 0;

      // 4. Calculate Deductions
      if (empComponents.length > 0) {
        empComponents.forEach(c => {
          const compDef = components.find(comp => comp.name === c.name);
          if (!compDef || compDef.type !== 'DEDUCTION') return;

          let value = 0;
          if (c.name === 'BPJS Kesehatan') {
            value = bpjsResults.bpjsKesEmployee;
          } else if (c.name === 'BPJS Ketenagakerjaan (JHT)') {
            value = bpjsResults.jhtEmployee;
          } else if (c.name === 'BPJS Ketenagakerjaan (JP)') {
            value = bpjsResults.jpEmployee;
          } else if (c.name === 'PPh 21') {
            value = pph21Value;
          } else {
            value = c.isFixed !== false ? (c.value || 0) : (baseSalary * (c.value || 0) / 100);
            value = applyComponentLogic(compDef, value);
          }

          deductionList.push({ name: c.name, value });
        });
      } else {
        components.forEach(c => {
          if (c.type !== 'DEDUCTION') return;

          let value = 0;
          if (c.name === 'BPJS Kesehatan') {
            value = bpjsResults.bpjsKesEmployee;
          } else if (c.name === 'BPJS Ketenagakerjaan (JHT)') {
            value = bpjsResults.jhtEmployee;
          } else if (c.name === 'BPJS Ketenagakerjaan (JP)') {
            value = bpjsResults.jpEmployee;
          } else if (c.name === 'PPh 21') {
            value = pph21Value;
          } else {
            let nominalValue = c.isFixed ? c.defaultValue : (baseSalary * c.defaultValue / 100);
            value = applyComponentLogic(c, nominalValue);
          }

          deductionList.push({ name: c.name, value });
        });
      }

      // Append reimbursement to allowances if any
      if (totalClaimsAmount > 0) {
        allowanceList.push({ name: 'Reimbursement', value: totalClaimsAmount });
      }

      const totalAllowances = allowanceList.reduce((sum, a) => sum + a.value, 0);
      const totalDeductionComponents = deductionList.reduce((sum, d) => sum + d.value, 0);

      // Attendance penalty (potongan keterlambatan)
      let attendancePenalty = 0;
      if (attendancePenaltyEnabled && totalLateMinutes > 0 && penaltyPerMinute > 0) {
        attendancePenalty = totalLateMinutes * penaltyPerMinute;
      }

      const grossPay = proRatedSalary + totalAllowances + overtimePay;
      const totalDeductionAmount = totalDeductionComponents + attendancePenalty;
      const netPay = Math.max(0, grossPay - totalDeductionAmount); // #7: netto tidak boleh negatif

      // Bulatkan sekali; total diakumulasi dari nilai yang SUDAH dibulatkan (#8: konsisten dgn rincian).
      const rGross = Math.round(grossPay);
      const rDeduction = Math.round(totalDeductionAmount);
      const rNet = Math.round(netPay);
      const rOvertime = Math.round(overtimePay);

      totalGross += rGross;
      totalDeductions += rDeduction;
      totalNet += rNet;
      totalOvertimePay += rOvertime;

      details.push({
        employeeId: emp.id,
        employeeName: emp.name,
        employeeCode: emp.employeeCode,
        department: emp.department?.name || '-',
        employmentType: salary.employmentType,
        salaryType: salary.salaryType,
        workingDays: totalWorkingDays,
        daysPresent,
        daysAbsent,
        daysLate,
        totalLateMinutes,
        baseSalary,
        proRatedSalary: Math.round(proRatedSalary),
        allowances: allowanceList,
        deductions: deductionList,
        attendancePenalty: Math.round(attendancePenalty),
        overtimeHours: overtimeHoursTotal,
        overtimePay: rOvertime,
        grossPay: rGross,
        totalDeduction: rDeduction,
        netPay: rNet,
      });
    }

    // Delete existing cancelled payroll if any
    if (existing && existing.status === 'CANCELLED') {
      await prisma.reimbursementClaim.updateMany({ where: { payrollId: existing.id }, data: { payrollId: null } });
      await prisma.payrollDetail.deleteMany({ where: { payrollId: existing.id } });
      await prisma.payroll.delete({ where: { id: existing.id } });
    }

    // Create payroll with details
    const payroll = await prisma.payroll.create({
      data: {
        period,
        periodName,
        status: 'DRAFT',
        totalEmployees: details.length,
        totalGross: Math.round(totalGross),
        totalDeductions: Math.round(totalDeductions),
        totalNet: Math.round(totalNet),
        totalOvertime: Math.round(totalOvertimePay),
        generatedBy: req.user?.username || 'System',
        notes: notes || null,
        details: {
          create: details,
        },
      },
      include: { details: true },
    });

    // Link the processed claims to this payroll
    if (approvedClaims.length > 0) {
      await prisma.reimbursementClaim.updateMany({
        where: {
          id: { in: approvedClaims.map(c => c.id) }
        },
        data: {
          payrollId: payroll.id
        }
      });
    }

    res.status(201).json({
      success: true,
      message: `Payroll ${periodName} berhasil di-generate untuk ${details.length} karyawan`,
      data: payroll,
    });

    if (req.user) {
      recordAuditLog({
        userId: req.user.id, username: req.user.username, role: req.user.role,
        action: 'CREATE', entity: 'Payroll', entityId: payroll.id,
        details: { period, totalEmployees: details.length, totalNet: Math.round(totalNet) },
        ipAddress: req.ip,
      });
    }
  } catch (err) {
    console.error('Payroll generate error:', err);
    handleControllerError(res, err, 'payrollController');
  }
};

// ─── Submit for Approval ─────────────────────────

const submitForApproval = async (req, res) => {
  try {
    const payroll = await prisma.payroll.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
    if (payroll.status !== 'DRAFT') return res.status(400).json({ success: false, message: 'Only DRAFT payroll can be submitted' });

    const updated = await prisma.payroll.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'AWAITING_APPROVAL' },
    });

    res.json({ success: true, message: 'Payroll submitted for director approval', data: updated });
  } catch (err) {
    handleControllerError(res, err, 'payrollController');
  }
};

// ─── Approve Payroll (Director) ──────────────────

const approve = async (req, res) => {
  try {
    const payroll = await prisma.payroll.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
    if (payroll.status !== 'AWAITING_APPROVAL') return res.status(400).json({ success: false, message: 'Payroll is not awaiting approval' });

    const updated = await prisma.payroll.update({
      where: { id: parseInt(req.params.id) },
      data: {
        status: 'APPROVED',
        approvedBy: req.user?.username || 'Director',
        approvedAt: new Date(),
      },
    });

    res.json({ success: true, message: 'Payroll approved', data: updated });
  } catch (err) {
    handleControllerError(res, err, 'payrollController');
  }
};

// ─── Reject Payroll (Director) ───────────────────

const reject = async (req, res) => {
  try {
    const { rejectionNote } = req.body;
    const payroll = await prisma.payroll.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
    if (payroll.status !== 'AWAITING_APPROVAL') return res.status(400).json({ success: false, message: 'Payroll is not awaiting approval' });

    const updated = await prisma.payroll.update({
      where: { id: parseInt(req.params.id) },
      data: {
        status: 'REJECTED',
        rejectedBy: req.user?.username || 'Director',
        rejectionNote: rejectionNote || null,
      },
    });

    res.json({ success: true, message: 'Payroll rejected', data: updated });
  } catch (err) {
    handleControllerError(res, err, 'payrollController');
  }
};

// ─── Finalize Payroll ────────────────────────────

const finalize = async (req, res) => {
  try {
    const payroll = await prisma.payroll.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
    if (payroll.status !== 'APPROVED') return res.status(400).json({ success: false, message: 'Only APPROVED payroll can be finalized' });

    const updated = await prisma.payroll.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'COMPLETED' },
    });

    res.json({ success: true, message: 'Payroll finalized', data: updated });
  } catch (err) {
    handleControllerError(res, err, 'payrollController');
  }
};

// ─── Cancel Payroll ──────────────────────────────

const cancel = async (req, res) => {
  try {
    const payroll = await prisma.payroll.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
    if (payroll.status === 'COMPLETED') return res.status(400).json({ success: false, message: 'Cannot cancel completed payroll' });

    const updated = await prisma.payroll.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'CANCELLED' },
    });

    // Unlink any reimbursement claims associated with this cancelled payroll
    await prisma.reimbursementClaim.updateMany({
      where: { payrollId: parseInt(req.params.id) },
      data: { payrollId: null }
    });

    res.json({ success: true, message: 'Payroll cancelled', data: updated });
  } catch (err) {
    handleControllerError(res, err, 'payrollController');
  }
};

// ─── Export to Excel ─────────────────────────────

const exportExcel = async (req, res) => {
  try {
    const payroll = await prisma.payroll.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { details: { orderBy: { department: 'asc' } } },
    });
    if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });

    const lang = req.query.lang || 'id';
    const isIndo = lang.startsWith('id');
    const isKo = lang.startsWith('ko');
    const isZh = lang.startsWith('zh');

    const isDemo = process.env.DEMO_MODE === 'true';
    const watermarkRow = isDemo ? ['⚠️ DEMO VERSION — SMART ATTENDANCE PRO | Hubungi: 082124130065'] : [];

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryTitle = isIndo ? 'REKAP PAYROLL' : isKo ? '급여 요약 보고서' : isZh ? '薪资汇总表' : 'PAYROLL SUMMARY';
    const summaryData = [
      ...(isDemo ? [watermarkRow, []] : []),
      [summaryTitle, '', '', '', '', ''],
      [isIndo ? 'Periode' : isKo ? '귀속연월' : isZh ? '期间' : 'Period', payroll.periodName],
      [isIndo ? 'Status' : isKo ? '상태' : isZh ? '状态' : 'Status', payroll.status],
      [isIndo ? 'Total Karyawan' : isKo ? '총 사원수' : isZh ? '总员工数' : 'Total Employees', payroll.totalEmployees],
      [isIndo ? 'Total Gross' : isKo ? '총 지급액' : isZh ? '总应发金额' : 'Total Gross', payroll.totalGross],
      [isIndo ? 'Total Potongan' : isKo ? '총 공제액' : isZh ? '总扣款金额' : 'Total Deductions', payroll.totalDeductions],
      [isIndo ? 'Total Lembur' : isKo ? '총 연장근로수당' : isZh ? '总加班费' : 'Total Overtime', payroll.totalOvertime],
      [isIndo ? 'Total Net' : isKo ? '총 실수령액' : isZh ? '总实发金额' : 'Total Net', payroll.totalNet],
      [],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, isIndo ? 'Ringkasan' : isKo ? '요약' : isZh ? '摘要' : 'Summary');

    // Detail sheet
    const headerRow = isIndo ? [
      'No', 'NIK', 'Nama', 'Departemen', 'Tipe', 'Hari Kerja', 'Hadir', 'Absen',
      'Terlambat', 'Menit Telat', 'Gaji Pokok', 'Gaji Pro-Rata', 'Tunjangan',
      'Lembur (Jam)', 'Lembur (Rp)', 'Pot. Kehadiran', 'BPJS Kes', 'BPJS JHT', 'BPJS JP', 'PPh 21', 'Pot. Lain', 'Gross', 'Total Pot.', 'Net Pay'
    ] : isKo ? [
      '번호', '사번', '성명', '부서', '구분', '소정근로일수', '출석일수', '결근일수',
      '지각횟수', '지각시간 (분)', '기본급', '일할계산 급여', '수당 총액',
      '연장근로 (시간)', '연장근로수당 (원)', '근태 패널티', '국민건강보험', '국민연금 (JHT)', '퇴직연금 (JP)', '소득세 (PPh 21)', '기타 공제', '총 지급액', '총 공제액', '실수령액'
    ] : isZh ? [
      '序号', '工号', '姓名', '部门', '类型', '工作日', '出勤', '缺勤',
      '迟到', '迟到时长 (分)', '基本工资', '按比例工资', '津贴',
      '加班 (小时)', '加班费 (元)', '考勤扣款', '医疗保险', '养老保险 (JHT)', '年金 (JP)', '个人所得税 (PPh 21)', '其他扣款', '应发金额', '总扣款', '实发金额'
    ] : [
      'No', 'NIK', 'Name', 'Department', 'Type', 'Working Days', 'Present', 'Absent',
      'Late', 'Late Minutes', 'Base Salary', 'Pro-Rated Salary', 'Allowances',
      'Overtime (Hours)', 'Overtime (Pay)', 'Attendance Penalty', 'BPJS Health', 'BPJS JHT', 'BPJS JP', 'PPh 21', 'Other Deductions', 'Gross', 'Total Deductions', 'Net Pay'
    ];

    const rows = payroll.details.map((d, i) => {
      const totalAllowances = (d.allowances || []).reduce((sum, a) => sum + a.value, 0);
      const deductionsArray = d.deductions || [];
      const bpjsKes = deductionsArray.find(x => x.name === 'BPJS Kesehatan')?.value || 0;
      const bpjsJht = deductionsArray.find(x => x.name === 'BPJS Ketenagakerjaan (JHT)')?.value || 0;
      const bpjsJp = deductionsArray.find(x => x.name === 'BPJS Ketenagakerjaan (JP)')?.value || 0;
      const pph21 = deductionsArray.find(x => x.name === 'PPh 21')?.value || 0;
      const otherDeduct = deductionsArray.filter(x => !['BPJS Kesehatan', 'BPJS Ketenagakerjaan (JHT)', 'BPJS Ketenagakerjaan (JP)', 'PPh 21'].includes(x.name)).reduce((sum, a) => sum + a.value, 0);

      return [
        i + 1, d.employeeCode, d.employeeName, d.department, d.employmentType,
        d.workingDays, d.daysPresent, d.daysAbsent, d.daysLate, d.totalLateMinutes,
        d.baseSalary, d.proRatedSalary, totalAllowances,
        d.overtimeHours, d.overtimePay, d.attendancePenalty,
        bpjsKes, bpjsJht, bpjsJp, pph21, otherDeduct,
        d.grossPay, d.totalDeduction, d.netPay,
      ];
    });

    const detailRows = [
      ...(isDemo ? [watermarkRow, []] : []),
      headerRow,
      ...rows
    ];
    const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);

    // Set column widths
    detailSheet['!cols'] = [
      { wch: 4 }, { wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 10 },
      { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(wb, detailSheet, isIndo ? 'Detail Payroll' : isKo ? '상세 급여' : isZh ? '薪资明细' : 'Payroll Details');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Payroll_${payroll.period}.xlsx`);
    res.send(buffer);
  } catch (err) {
    handleControllerError(res, err, 'payrollController');
  }
};

// ─── Get Employee Slip ───────────────────────────

const getSlip = async (req, res) => {
  try {
    const { id, empId } = req.params;

    const detail = await prisma.payrollDetail.findFirst({
      where: {
        payrollId: parseInt(id),
        employeeId: parseInt(empId),
      },
      include: {
        payroll: true,
      },
    });

    if (!detail) return res.status(404).json({ success: false, message: 'Slip gaji not found' });

    // Get company info
    const settings = await prisma.settings.findMany({
      where: { key: { in: ['companyName', 'companyAddress'] } },
    });
    const company = {};
    settings.forEach(s => { company[s.key] = s.value; });

    res.json({
      success: true,
      data: {
        company,
        period: detail.payroll.periodName,
        status: detail.payroll.status,
        detail,
      },
    });
  } catch (err) {
    handleControllerError(res, err, 'payrollController');
  }
};

// ─── Get Employee's Own Slips ────────────────────

const getMySlips = async (req, res) => {
  try {
    const empId = parseInt(req.params.empId);

    // Security: Validate that the requesting user owns this employee record (unless they are Admin/Accounting)
    const allowedPrivilegedRoles = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTING'];
    if (!allowedPrivilegedRoles.includes(req.user.role) && req.user.employeeId !== empId) {
      return res.status(403).json({ success: false, message: 'You can only view your own payslips' });
    }

    const slips = await prisma.payrollDetail.findMany({
      where: {
        employeeId: empId,
        payroll: { status: { in: ['COMPLETED', 'APPROVED'] } },
      },
      include: { payroll: { select: { period: true, periodName: true, status: true } } },
      orderBy: { payroll: { period: 'desc' } },
    });

    res.json({ success: true, data: slips });
  } catch (err) {
    handleControllerError(res, err, 'payrollController');
  }
};

// ─── Director: Payroll Summary ───────────────────

const getPayrollSummary = async (req, res) => {
  try {
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastPeriod = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    const [current, previous, pendingApproval] = await Promise.all([
      prisma.payroll.findUnique({ where: { period: currentPeriod } }),
      prisma.payroll.findUnique({ where: { period: lastPeriod } }),
      prisma.payroll.count({ where: { status: 'AWAITING_APPROVAL' } }),
    ]);

    res.json({
      success: true,
      data: {
        currentPeriod: current ? {
          period: current.periodName,
          status: current.status,
          totalNet: current.totalNet,
          totalEmployees: current.totalEmployees,
        } : null,
        previousPeriod: previous ? {
          period: previous.periodName,
          totalNet: previous.totalNet,
        } : null,
        pendingApproval,
        change: current && previous && previous.totalNet > 0
          ? Math.round(((current.totalNet - previous.totalNet) / previous.totalNet) * 100)
          : 0,
      },
    });
  } catch (err) {
    handleControllerError(res, err, 'payrollController');
  }
};

module.exports = {
  getAll, getById, generate,
  submitForApproval, approve, reject, finalize, cancel,
  exportExcel, getSlip, getMySlips,
  getPayrollSummary,
};
