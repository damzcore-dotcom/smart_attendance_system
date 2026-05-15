const prisma = require('../prismaClient');
const XLSX = require('xlsx');
const { recordAuditLog } = require('./auditLogController');

// ─── Helper: Calculate Overtime Hours ────────────

const calculateOvertimeHours = (checkIn, checkOut, shiftEndTime) => {
  if (!checkIn || !checkOut) return 0;

  const [endH, endM] = (shiftEndTime || '17:00').split(':').map(Number);
  const shiftEnd = new Date(checkOut);
  shiftEnd.setHours(endH, endM, 0, 0);

  if (checkOut <= shiftEnd) return 0;

  const diffMs = checkOut - shiftEnd;
  const hours = diffMs / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100; // Round to 2 decimal
};

// ─── Helper: Format Currency ─────────────────────

const formatRupiah = (num) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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

    // Date range for attendance
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // Get working days config
    const settingsList = await prisma.settings.findMany();
    const workingDaysSetting = settingsList.find(s => s.key === 'workingDays')?.value || '[1,2,3,4,5]';
    const workingDaysOfWeek = JSON.parse(workingDaysSetting);

    // Calculate working days in month
    let totalWorkingDays = 0;
    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      if (workingDaysOfWeek.includes(d.getUTCDay())) totalWorkingDays++;
    }

    // Get payroll config
    const payrollConfigs = await prisma.payrollConfig.findMany();
    const configObj = {};
    payrollConfigs.forEach(c => { configObj[c.key] = c.value; });

    const overtimeEnabled = configObj.overtimeEnabled === 'true';
    const attendancePenaltyEnabled = configObj.attendancePenaltyEnabled !== 'false'; // default true
    const penaltyPerMinute = parseFloat(configObj.penaltyPerMinute) || 0;
    const overtimeMode = configObj.overtimeMode || 'AUTO'; // AUTO or MANUAL

    // Get overtime rules
    const overtimeRules = overtimeEnabled ? await prisma.overtimeRule.findMany({ where: { isActive: true }, orderBy: { hourFrom: 'asc' } }) : [];

    // Get all active employees with salary config
    const employees = await prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      include: {
        department: true,
        shift: true,
        salary: true,
      },
    });

    // Get all salary components and position allowances
    const components = await prisma.salaryComponent.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const positionAllowances = await prisma.positionAllowance.findMany();

    const details = [];
    let totalGross = 0, totalDeductions = 0, totalNet = 0, totalOvertimePay = 0;

    for (const emp of employees) {
      const salary = emp.salary;
      if (!salary) continue; // Skip employees without salary config

      // Get attendance for this employee in the period
      const attendanceRecords = await prisma.attendance.findMany({
        where: {
          employeeId: emp.id,
          date: { gte: startDate, lte: endDate },
        },
      });

      // Calculate attendance stats
      let daysPresent = 0, daysAbsent = 0, daysLate = 0, totalLateMinutes = 0;
      let overtimeHoursTotal = 0;

      attendanceRecords.forEach(a => {
        const dayOfWeek = new Date(a.date).getUTCDay();
        const isWorkingDay = workingDaysOfWeek.includes(dayOfWeek);

        if (['PRESENT', 'LATE'].includes(a.status)) {
          daysPresent++;
          if (a.status === 'LATE') {
            daysLate++;
            totalLateMinutes += a.lateMinutes || 0;
          }

          // Calculate overtime
          if (overtimeEnabled && a.checkOut && emp.shift) {
            const otHours = calculateOvertimeHours(a.checkIn, a.checkOut, emp.shift.endTime);
            if (otHours > 0) overtimeHoursTotal += otHours;
          }
        } else if (a.status === 'MANGKIR') {
          // Mangkir adds 30 min penalty
          totalLateMinutes += 30;
          daysLate++;
        } else if (['ABSENT'].includes(a.status) && isWorkingDay) {
          daysAbsent++;
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
        if (totalWorkingDays > 0 && daysAbsent > 0) {
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

      // If employee has custom components, use those; otherwise use matrix/defaults
      if (empComponents.length > 0) {
        empComponents.forEach(c => {
          const compDef = components.find(comp => comp.name === c.name);
          if (!compDef) return;

          let value = c.isFixed !== false ? (c.value || 0) : (baseSalary * (c.value || 0) / 100);
          value = applyComponentLogic(compDef, value);

          if (c.type === 'ALLOWANCE') {
            allowanceList.push({ name: c.name, value });
          } else {
            deductionList.push({ name: c.name, value });
          }
        });
      } else {
        // Use default components, overridden by Position Allowance Matrix if exists
        components.forEach(c => {
          let nominalValue = c.isFixed ? c.defaultValue : (baseSalary * c.defaultValue / 100);
          
          if (c.type === 'ALLOWANCE' && emp.position) {
            const matrixOverride = positionAllowances.find(pa => pa.position === emp.position && pa.salaryComponentId === c.id);
            if (matrixOverride) {
              nominalValue = matrixOverride.nominal;
            }
          }

          const finalValue = applyComponentLogic(c, nominalValue);

          if (c.type === 'ALLOWANCE') {
            allowanceList.push({ name: c.name, value: finalValue });
          } else {
            deductionList.push({ name: c.name, value: finalValue });
          }
        });
      }

      const totalAllowances = allowanceList.reduce((sum, a) => sum + a.value, 0);
      const totalDeductionComponents = deductionList.reduce((sum, d) => sum + d.value, 0);

      // Attendance penalty (potongan keterlambatan)
      let attendancePenalty = 0;
      if (attendancePenaltyEnabled && totalLateMinutes > 0 && penaltyPerMinute > 0) {
        attendancePenalty = totalLateMinutes * penaltyPerMinute;
      }

      // Overtime pay calculation
      let overtimePay = 0;
      if (overtimeEnabled && overtimeHoursTotal > 0 && baseSalary > 0) {
        // Hourly rate = baseSalary / 173 (standard monthly hours)
        const hourlyRate = baseSalary / 173;

        if (overtimeRules.length > 0) {
          // Apply tiered overtime rules
          let remainingHours = overtimeHoursTotal;
          for (const rule of overtimeRules) {
            const tierHours = rule.hourTo - rule.hourFrom;
            const applicableHours = Math.min(remainingHours, tierHours);
            if (applicableHours > 0) {
              overtimePay += applicableHours * hourlyRate * rule.multiplier;
              remainingHours -= applicableHours;
            }
            if (remainingHours <= 0) break;
          }
        } else {
          // Default: 1.5x for all OT hours
          overtimePay = overtimeHoursTotal * hourlyRate * 1.5;
        }
      }

      const grossPay = proRatedSalary + totalAllowances + overtimePay;
      const totalDeductionAmount = totalDeductionComponents + attendancePenalty;
      const netPay = grossPay - totalDeductionAmount;

      totalGross += grossPay;
      totalDeductions += totalDeductionAmount;
      totalNet += netPay;
      totalOvertimePay += overtimePay;

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
        overtimePay: Math.round(overtimePay),
        grossPay: Math.round(grossPay),
        totalDeduction: Math.round(totalDeductionAmount),
        netPay: Math.round(netPay),
      });
    }

    // Delete existing cancelled payroll if any
    if (existing && existing.status === 'CANCELLED') {
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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

    res.json({ success: true, message: 'Payroll cancelled', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['REKAP PAYROLL', '', '', '', '', ''],
      ['Periode', payroll.periodName],
      ['Status', payroll.status],
      ['Total Karyawan', payroll.totalEmployees],
      ['Total Gross', payroll.totalGross],
      ['Total Potongan', payroll.totalDeductions],
      ['Total Lembur', payroll.totalOvertime],
      ['Total Net', payroll.totalNet],
      [],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // Detail sheet
    const headerRow = [
      'No', 'NIK', 'Nama', 'Departemen', 'Tipe', 'Hari Kerja', 'Hadir', 'Absen',
      'Terlambat', 'Menit Telat', 'Gaji Pokok', 'Gaji Pro-Rata', 'Tunjangan',
      'Lembur (Jam)', 'Lembur (Rp)', 'Pot. Kehadiran', 'Potongan', 'Gross', 'Total Pot.', 'Net Pay'
    ];

    const rows = payroll.details.map((d, i) => {
      const totalAllowances = (d.allowances || []).reduce((sum, a) => sum + a.value, 0);
      const totalDeductComp = (d.deductions || []).reduce((sum, a) => sum + a.value, 0);
      return [
        i + 1, d.employeeCode, d.employeeName, d.department, d.employmentType,
        d.workingDays, d.daysPresent, d.daysAbsent, d.daysLate, d.totalLateMinutes,
        d.baseSalary, d.proRatedSalary, totalAllowances,
        d.overtimeHours, d.overtimePay, d.attendancePenalty, totalDeductComp,
        d.grossPay, d.totalDeduction, d.netPay,
      ];
    });

    const detailSheet = XLSX.utils.aoa_to_sheet([headerRow, ...rows]);

    // Set column widths
    detailSheet['!cols'] = [
      { wch: 4 }, { wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 10 },
      { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(wb, detailSheet, 'Detail Payroll');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Payroll_${payroll.period}.xlsx`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get Employee's Own Slips ────────────────────

const getMySlips = async (req, res) => {
  try {
    const empId = parseInt(req.params.empId);

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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAll, getById, generate,
  submitForApproval, approve, reject, finalize, cancel,
  exportExcel, getSlip, getMySlips,
  getPayrollSummary,
};
