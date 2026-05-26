const prisma = require('../prismaClient');
const { calculateLateness, resolveStatus } = require('../utils/lateCalculator');
const { getDistance } = require('../utils/geo');
const XLSX = require('xlsx');
const { recordAuditLog } = require('./auditLogController');

/**
 * GET /api/attendance
 */
const getAll = async (req, res) => {
  try {
    const { search, dept, section, position, status, date, period, startDate, endDate, sortBy, order } = req.query;

    // Fetch Global Settings (Working Days)
    const settingsList = await prisma.settings.findMany();
    const workingDaysSetting = settingsList.find(s => s.key === 'workingDays')?.value || '[1,2,3,4,5]';
    const workingDays = JSON.parse(workingDaysSetting);

    const where = {};

    // Date filtering
    const now = new Date();
    if (period === 'Today' || (!period && !date && !startDate)) {
      const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      where.date = { gte: today, lt: tomorrow };
    } else if (period === 'This Week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      where.date = { gte: startOfWeek, lte: now };
    } else if (period === 'This Month') {
      const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      where.date = { gte: startOfMonth, lte: now };
    } else if (period === 'Custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    } else if (date) {
      const d = new Date(date);
      const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const next = new Date(start);
      next.setUTCDate(next.getUTCDate() + 1);
      where.date = { gte: start, lt: next };
    }

    // Organizational filters
    if (dept && dept !== 'All') {
      where.employee = { ...where.employee, department: { name: dept } };
    }
    if (section && section !== 'All') {
      where.employee = { ...where.employee, section: section };
    }
    if (position && position !== 'All') {
      where.employee = { ...where.employee, position: position };
    }

    // Search
    if (search) {
      where.employee = {
        ...where.employee,
        name: { contains: search, mode: 'insensitive' },
      };
    }
    if (status && status !== 'All') {
      where.status = status;
    }

    // Sorting Logic
    let orderBy = { date: 'desc' };
    if (sortBy) {
      const sortDir = order === 'asc' ? 'asc' : 'desc';
      if (sortBy === 'name') {
        orderBy = { employee: { name: sortDir } };
      } else if (sortBy === 'dept') {
        orderBy = { employee: { department: { name: sortDir } } };
      } else {
        orderBy = { [sortBy]: sortDir };
      }
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // 3. Optimized Summary Calculation (O(1) Memory footprint via DB Aggregation)
    const [total, records, groupStats, uniqueEmpRecords, absentRecords, calendarOverrides] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        include: { employee: { include: { department: true } } },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.attendance.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { lateMinutes: true }
      }),
      prisma.attendance.findMany({
        where,
        distinct: ['employeeId'],
        select: { employeeId: true }
      }),
      prisma.attendance.findMany({
        where: { ...where, status: 'ABSENT' },
        select: { date: true }
      }),
      prisma.companyCalendar.findMany({
        where: where.date ? { date: where.date } : {}
      })
    ]);

    let hadirCount = 0, telatCount = 0, mangkirCount = 0, absenCount = 0, holidayCount = 0, cutiCount = 0, sakitCount = 0, izinCount = 0, totalLate = 0;

    groupStats.forEach(stat => {
      const s = stat.status;
      const count = stat._count._all;
      const late = stat._sum.lateMinutes || 0;

      if (s === 'PRESENT') hadirCount += count;
      else if (s === 'LATE') telatCount += count;
      else if (s === 'MANGKIR') mangkirCount += count;
      else if (s === 'HOLIDAY') holidayCount += count;
      else if (s === 'CUTI') cutiCount += count;
      else if (s === 'SAKIT') sakitCount += count;
      else if (s === 'IZIN') izinCount += count;
      else absenCount += count;

      totalLate += late + (s === 'MANGKIR' ? count * 30 : 0);
    });

    const overrideMap = {};
    if (calendarOverrides) {
      calendarOverrides.forEach(c => {
        overrideMap[c.date.toISOString().split('T')[0]] = c;
      });
    }

    // Dynamically resolve HOLIDAY for ABSENT records based on working days settings & Calendar overrides
    absentRecords.forEach(r => {
      const dateStr = r.date.toISOString().split('T')[0];
      const override = overrideMap[dateStr];
      const recordDay = r.date.getUTCDay();
      
      let isLibur = false;
      if (override) {
         if (override.type === 'HOLIDAY') isLibur = true;
         if (override.type === 'WORKDAY') isLibur = false;
      } else {
         isLibur = !workingDays.includes(recordDay);
      }

      if (isLibur) {
        holidayCount++;
        absenCount--;
      }
    });

    const summary = {
      total: total,
      hadir: hadirCount,
      telat: telatCount,
      mangkir: mangkirCount,
      absen: absenCount,
      holiday: holidayCount,
      cuti: cutiCount,
      sakit: sakitCount,
      izin: izinCount,
      totalLate: totalLate,
      uniqueEmployeeCount: uniqueEmpRecords.length,
      calendarOverrides: calendarOverrides, // Send to frontend
      workingDays: workingDays // Send to frontend for accurate padding
    };

    res.json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary,
      data: records.map(r => {
        let resolved = resolveStatus(r.checkIn, r.checkOut, r.status, r.date);
        
        if (resolved === 'MANGKIR' || resolved === 'ABSENT' || resolved === 'HOLIDAY') {
          const dateStr = r.date.toISOString().split('T')[0];
          const override = overrideMap[dateStr];
          const recordDay = r.date.getUTCDay();
          
          let isLibur = false;
          if (override) {
             if (override.type === 'HOLIDAY') isLibur = true;
             if (override.type === 'WORKDAY') isLibur = false;
          } else {
             isLibur = !workingDays.includes(recordDay);
          }
          
          if (isLibur) {
             resolved = 'HOLIDAY';
             r.lateMinutes = 0;
          }
        }
        
        let displayStatus = 'Alpa';
        if (resolved === 'PRESENT') displayStatus = 'Hadir';
        else if (resolved === 'LATE') displayStatus = 'Terlambat';
        else if (resolved === 'MANGKIR') displayStatus = 'Mangkir';
        else if (resolved === 'HOLIDAY') displayStatus = 'Libur';
        else if (resolved === 'CUTI') displayStatus = 'Cuti';
        else if (resolved === 'SAKIT') displayStatus = 'Sakit';
        else if (resolved === 'IZIN') displayStatus = 'Izin';
        else if (resolved === 'ABSENT') displayStatus = 'Alpa';

        return {
          id: r.id,
          name: r.employee.name,
          employeeCode: r.employee.employeeCode,
          dept: r.employee.department.name,
          section: r.employee.section,
          position: r.employee.position,
          date: r.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }),
          checkIn: r.checkIn ? r.checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-- : --',
          checkOut: r.checkOut ? r.checkOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-- : --',
          status: displayStatus,
          lateMinutes: r.lateMinutes,
          overtimeHours: r.overtimeHours,
          mode: r.mode,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/attendance/check-in
 */
const checkIn = async (req, res) => {
  try {
    const { employeeId, mode, lat, lng, photoData } = req.body;

    if (mode !== 'Face ID') {
      return res.status(403).json({ 
        success: false, 
        message: 'Manual check-in is disabled. Please use Face ID verification.' 
      });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { shift: true },
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Geofencing Check
    const settings = await prisma.settings.findMany();
    const isStrict = settings.find(s => s.key === 'strictGeofencing')?.value === 'true';

    if (isStrict) {
      const { lat, lng, accuracy, timestamp } = req.body;

      if (!lat || !lng) {
        return res.status(400).json({ success: false, message: 'GPS location is required for check-in' });
      }

      // 1. Accuracy Check (Max 500m — indoor GPS is often low accuracy)
      if (accuracy && accuracy > 500) {
        return res.status(403).json({ 
          success: false, 
          message: `GPS accuracy too low (${Math.round(accuracy)}m). Please turn off mock locations or move to an open area.` 
        });
      }

      // 2. Freshness Check (Max 5 minutes old)
      if (timestamp) {
        const age = Date.now() - timestamp;
        if (age > 5 * 60 * 1000) { // 5 minutes
          return res.status(403).json({ success: false, message: 'GPS location data is stale. Please refresh and try again.' });
        }
      }

      const locations = await prisma.location.findMany();
      let isInside = false;
      let nearestDist = Infinity;

      for (const loc of locations) {
        const dist = getDistance(parseFloat(lat), parseFloat(lng), loc.lat, loc.lng);
        if (dist <= loc.radius) {
          isInside = true;
          break;
        }
        if (dist < nearestDist) nearestDist = dist;
      }

      if (!isInside) {
        return res.status(403).json({ 
          success: false, 
          message: `You are outside the office radius (Nearest: ${Math.round(nearestDist)}m away)` 
        });
      }
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    // Check if already checked in today
    const existing = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (existing && existing.checkIn) {
      return res.status(400).json({ success: false, message: 'Already checked in today' });
    }

    // Calculate lateness
    const shiftStart = employee.shift?.startTime || '08:00';
    const gracePeriod = employee.shift?.gracePeriod || 15;
    const { lateMinutes, status: lateStatus } = calculateLateness(now, shiftStart, gracePeriod);

    // Initial status for check-in is either PRESENT, LATE, or MANGKIR (if day ends)
    // But since this is a real-time check-in, if we don't have check-out yet, 
    // we show current status. resolveStatus will handle MANGKIR if we re-check later.
    const status = resolveStatus(now, existing?.checkOut, lateStatus);

    const attendance = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date: today } },
      update: { checkIn: now, status, lateMinutes, mode, photoUrl: photoData || existing?.photoUrl },
      create: { employeeId, date: today, checkIn: now, status, lateMinutes, mode, photoUrl: photoData || null },
    });

    // Create notification if late
    if (status === 'LATE') {
      await prisma.notification.create({
        data: {
          employeeId,
          title: 'Late Check-in',
          message: `You were ${lateMinutes} minutes late today.`,
        },
      });
    }

    res.json({
      success: true,
      message: status === 'LATE' ? `Checked in (${lateMinutes}m late)` : 'Checked in on time!',
      data: attendance,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/attendance/check-out
 */
const checkOut = async (req, res) => {
  try {
    const { employeeId, photoData } = req.body;
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    const attendance = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
      include: { employee: { include: { shift: true } } }
    });

    if (!attendance || !attendance.checkIn) {
      return res.status(400).json({ success: false, message: 'No check-in record found for today' });
    }

    if (attendance.checkOut) {
      return res.status(400).json({ success: false, message: 'Already checked out today' });
    }

    // Fetch Settings to check for Saturday Half-Day rules
    const settingsList = await prisma.settings.findMany();
    const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
    const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';

    // Recalculate status now that we have both checkIn and checkOut
    const shiftStart = attendance.employee?.shift?.startTime || '08:00';
    let shiftEnd = attendance.employee?.shift?.endTime || '17:00';
    const gracePeriod = attendance.employee?.shift?.gracePeriod || 15;
    
    // If today is Saturday (6) and half-day is enabled, override shiftEnd
    if (now.getDay() === 6 && isSaturdayHalfDay) {
      shiftEnd = satCheckoutTime;
    }

    let lateStatus = 'PRESENT';
    let lateMinutes = 0;
    
    if (attendance.checkIn) {
      const calc = calculateLateness(attendance.checkIn, shiftStart, gracePeriod);
      lateStatus = calc.status;
      lateMinutes = calc.lateMinutes;
    }

    const finalStatus = resolveStatus(attendance.checkIn, now, lateStatus);

    // Calculate Overtime
    let overtimeHours = 0;
    const autoCalcOt = settingsList.find(s => s.key === 'autoCalculateOvertime')?.value !== 'false';
    const [endHour, endMinute] = shiftEnd.split(':').map(Number);
    const expectedEnd = new Date(now);
    expectedEnd.setHours(endHour, endMinute, 0, 0);

    if (autoCalcOt && now > expectedEnd) {
      const diffMs = now.getTime() - expectedEnd.getTime();
      overtimeHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
    }

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { 
        checkOut: now, 
        status: finalStatus, 
        overtimeHours,
        photoUrl: photoData || attendance.photoUrl
      },
    });

    res.json({ success: true, message: 'Checked out successfully', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/attendance/summary
 */
const getSummary = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const totalEmployees = await prisma.employee.count({ where: { status: 'ACTIVE' } });

    const todayRecords = await prisma.attendance.findMany({
      where: { date: { gte: today, lt: tomorrow } },
    });

    const present = todayRecords.filter(r => r.status === 'PRESENT').length;
    const late = todayRecords.filter(r => r.status === 'LATE').length;
    const mangkir = todayRecords.filter(r => r.status === 'MANGKIR').length;
    const absent = totalEmployees - present - late - mangkir;
    const avgLateMinutes = late > 0
      ? Math.round(todayRecords.filter(r => r.status === 'LATE').reduce((sum, r) => sum + r.lateMinutes, 0) / late)
      : 0;

    res.json({
      success: true,
      data: { totalEmployees, present, late, mangkir, absent, avgLateMinutes },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/attendance/history/:empId
 */
const getHistory = async (req, res) => {
  try {
    const empId = parseInt(req.params.empId);
    const { month, year } = req.query;

    const where = { employeeId: empId };

    if (month && year) {
      const start = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
      const end = new Date(Date.UTC(parseInt(year), parseInt(month), 0, 23, 59, 59, 999));
      where.date = { gte: start, lte: end };
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'asc' },
      take: 31,
    });

    res.json({
      success: true,
      data: records.map(r => ({
        day: r.date.getDate().toString().padStart(2, '0'),
        weekday: r.date.toLocaleDateString('en-US', { weekday: 'short' }),
        in: r.checkIn ? r.checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-- : --',
        out: r.checkOut ? r.checkOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-- : --',
        status: r.status === 'PRESENT' ? 'Hadir' : 
                r.status === 'LATE' ? 'Terlambat' : 
                r.status === 'MANGKIR' ? 'Mangkir' : 
                r.status === 'HOLIDAY' ? 'Libur' : 
                r.status === 'CUTI' ? 'Cuti' : 
                r.status === 'SAKIT' ? 'Sakit' : 
                r.status === 'IZIN' ? 'Izin' : 
                r.status === 'ABSENT' ? 'Alpa' : 'Alpa',
        lateMinutes: (r.status === 'MANGKIR' || r.status === 'MISSING') ? 30 : r.lateMinutes,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Global progress store for attendance import
global.attendanceImportProgress = global.attendanceImportProgress || {};

/**
 * GET /api/attendance/import-progress
 * Poll the progress of an attendance import job
 */
const getImportProgress = async (req, res) => {
  const { jobId } = req.query;
  if (!jobId || !global.attendanceImportProgress[jobId]) {
    return res.json({ success: true, progress: 0, phase: 'idle', detail: '' });
  }
  const p = global.attendanceImportProgress[jobId];
  res.json({ success: true, ...p });
};

/**
 * POST /api/attendance/import
 * Import attendance from fingerprint machine Excel
 * Excel columns: Department, Name, No., Date/Time, Status(C/In|C/Out), Location ID, ID Number, VerifyCode, CardNo
 */
const importFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const jobId = req.query.jobId || `att_${Date.now()}`;
    const updateProgress = (progress, phase, detail) => {
      global.attendanceImportProgress[jobId] = { progress, phase, detail };
    };
    updateProgress(5, 'reading', 'Membaca file Excel...');

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    if (rows.length < 2) {
      return res.status(400).json({ success: false, message: 'File is empty or has no data rows' });
    }

    // Detect column mapping from header row
    const header = rows[0].map(h => (h || '').toString().trim().toLowerCase());
    const colMap = {
      department: header.findIndex(h => h.includes('department')),
      name: header.findIndex(h => h === 'name'),
      no: header.findIndex(h => h === 'no.' || h === 'no'),
      dateTime: header.findIndex(h => h.includes('date') || h.includes('time')),
      status: header.findIndex(h => h === 'status'),
      locationId: header.findIndex(h => h.includes('location')),
      idNumber: header.findIndex(h => h.includes('id number') || h.includes('idnumber') || h.includes('id num')),
      verifyCode: header.findIndex(h => h.includes('verify')),
      cardNo: header.findIndex(h => h.includes('card')),
    };

    if (colMap.dateTime === -1 || colMap.status === -1) {
      return res.status(400).json({ success: false, message: 'Cannot detect Date/Time or Status column in Excel' });
    }
    if (colMap.idNumber === -1 && colMap.name === -1) {
      return res.status(400).json({ success: false, message: 'Cannot detect ID Number or Name column for employee matching' });
    }

    console.log('[Import Debug] Column Mapping:', colMap);
    console.log('[Import Debug] Total Rows found:', rows.length - 1);
    updateProgress(10, 'parsing', `Membaca ${rows.length - 1} baris data...`);
    // Parse all data rows
    const dataRows = rows.slice(1).filter(r => r && r.length > 0);
    
    // Group by employee+date
    const grouped = {};
    const unmatchedNames = new Set();
    
    let imported = 0;
    const errors = [];

    // Pre-fetch all employees
    const allEmployees = await prisma.employee.findMany({
      select: { id: true, employeeCode: true, name: true, shift: true },
    });
    const empByCode = {};
    const empByName = {};
    allEmployees.forEach(e => {
      empByCode[e.employeeCode.toString().trim()] = e;
      empByName[e.name.toLowerCase().trim()] = e;
    });

    updateProgress(15, 'matching', `Mencocokkan ${dataRows.length} baris dengan ${allEmployees.length} karyawan...`);

    // 1. DETERMINE TARGET MONTH/YEAR (From first valid data row)
    let targetMonth = 4; // Default April
    let targetYear = 2026;
    
    // 2. GROUP RAW EXCEL DATA (STRICT DATE ALIGNMENT)
    for (const row of dataRows) {
      if (!row || row.length < 3) continue;
      const rawDateTime = (row[2] || '').toString().trim();
      const rawStatus = (row[3] || '').toString().trim().toLowerCase();
      const rawId = (row[4] || '').toString().trim();
      const rawName = (row[1] || '').toString().trim();

      if (!rawDateTime.includes('/')) continue;

      // Format from Machine: "M/D/YYYY H:MM:SS AM/PM"
      const parts = rawDateTime.split(' ');
      const dateParts = parts[0].split('/');
      
      const m = parseInt(dateParts[0]); // Month
      const d = parseInt(dateParts[1]); // Day
      const y = parseInt(dateParts[2]); // Year

      if (isNaN(m) || isNaN(d) || isNaN(y)) continue;
      
      // Update target month/year
      targetMonth = m;
      targetYear = y;

      let emp = empByCode[rawId] || empByName[rawName.toLowerCase()];
      if (!emp) {
        // Record unmatched employee info so admin knows who was skipped
        const identifier = rawId ? `${rawName} (NIK: ${rawId})` : rawName;
        if (identifier.trim()) unmatchedNames.add(identifier);
        continue;
      }

      // CONSTRUCT DATE STRING (YYYY-MM-DD) - NO SHIFTING ALLOWED
      const dateOnlyStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const groupKey = `${emp.id}|${dateOnlyStr}`;

      if (!grouped[groupKey]) {
        grouped[groupKey] = { employeeId: emp.id, employee: emp, date: dateOnlyStr, checkIn: null, checkOut: null };
      }

      // Parse time accurately
      const timeParts = parts[1].split(':');
      let hours = parseInt(timeParts[0]);
      const minutes = parseInt(timeParts[1]);
      const seconds = parseInt(timeParts[2] || 0);
      const ampm = (parts[2] || '').toUpperCase();

      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      // This is the actual timestamp of the event
      const eventTime = new Date(y, m - 1, d, hours, minutes, seconds);

      if (rawStatus.includes('in') || hours < 12) {
        if (!grouped[groupKey].checkIn || eventTime < grouped[groupKey].checkIn) grouped[groupKey].checkIn = eventTime;
      } else {
        if (!grouped[groupKey].checkOut || eventTime > grouped[groupKey].checkOut) grouped[groupKey].checkOut = eventTime;
      }
    }

    // 3. GENERATE FULL SEQUENCE (1 to End of Month)
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate(); // Get last day
    const employeesInvolved = [...new Set(Object.values(grouped).map(g => g.employeeId))];

    for (const empId of employeesInvolved) {
      const emp = allEmployees.find(e => e.id === empId);
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const key = `${empId}|${dateStr}`;
        
        // If this date is NOT in excel data, we create an empty entry
        if (!grouped[key]) {
          grouped[key] = { employeeId: empId, employee: emp, date: dateStr, checkIn: null, checkOut: null };
        }
      }
    }

    // 4. UPSERT ALL RECORDS (1-30)
    const totalEntries = Object.keys(grouped).length;
    let processedEntries = 0;
    updateProgress(30, 'saving', `Menyimpan 0/${totalEntries} data ke database...`);

    for (const [key, entry] of Object.entries(grouped)) {
      try {
        const [y, m, d] = entry.date.split('-').map(Number);
        const dateObj = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)); 
        
        const emp = entry.employee;
        const shiftStart = emp.shift?.startTime || '08:00';
        const gracePeriod = emp.shift?.gracePeriod || 15;

        let lateStatus = 'PRESENT';
        let lateMinutes = 0;
        if (entry.checkIn) {
          const calc = calculateLateness(entry.checkIn, shiftStart, gracePeriod);
          lateStatus = calc.status;
          lateMinutes = calc.lateMinutes;
        }

        const status = resolveStatus(entry.checkIn, entry.checkOut, lateStatus);

        await prisma.attendance.upsert({
          where: { employeeId_date: { employeeId: entry.employeeId, date: dateObj } },
          update: {
            checkIn: entry.checkIn || null,
            checkOut: entry.checkOut || null,
            status,
            lateMinutes,
            mode: 'Fingerprint'
          },
          create: {
            employeeId: entry.employeeId,
            date: dateObj,
            checkIn: entry.checkIn || null,
            checkOut: entry.checkOut || null,
            status,
            lateMinutes,
            mode: 'Fingerprint'
          }
        });
        imported++;
        processedEntries++;
        // Update progress every 10 records to avoid overhead
        if (processedEntries % 10 === 0 || processedEntries === totalEntries) {
          const pct = Math.round(30 + (processedEntries / totalEntries) * 65);
          updateProgress(pct, 'saving', `Menyimpan ${processedEntries}/${totalEntries} data ke database...`);
        }
      } catch (err) {
        errors.push(`${key}: ${err.message}`);
        processedEntries++;
      }
    }

    updateProgress(98, 'finalizing', 'Menyelesaikan import...');

    const unmatchedList = Array.from(unmatchedNames);
    const unmatchedCount = unmatchedList.length;

    updateProgress(100, 'done', 'Import selesai!');

    res.json({
      success: true,
      jobId,
      message: `Import Selesai: ${imported} data berhasil diproses otomatis.${unmatchedCount > 0 ? ` ${unmatchedCount} karyawan tidak ditemukan di sistem.` : ''}${errors.length > 0 ? ` ${errors.length} error.` : ''}`,
      data: {
        totalRows: dataRows.length,
        imported,
        unmatchedCount,
        unmatched: unmatchedList,
        errorCount: errors.length,
        errors: errors.slice(0, 20),
      },
    });

    // Clean up progress after 30s
    setTimeout(() => { delete global.attendanceImportProgress[jobId]; }, 30000);
  } catch (err) {
    console.error('Import attendance error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/attendance/recalculate
 * Recalculate lateness for a date range based on CURRENT shifts
 */
const recalculate = async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start and End dates are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const records = await prisma.attendance.findMany({
      where: { date: { gte: start, lte: end }, checkIn: { not: null } },
      include: { employee: { include: { shift: true } } },
    });

    let updatedCount = 0;
    for (const record of records) {
      const shiftStart = record.employee.shift?.startTime || '08:00';
      const gracePeriod = record.employee.shift?.gracePeriod || 15;
      
      let lateStatus = 'PRESENT';
      let lateMinutes = 0;
      if (record.checkIn) {
        const calc = calculateLateness(record.checkIn, shiftStart, gracePeriod);
        lateStatus = calc.status;
        lateMinutes = calc.lateMinutes;
      }
      
      const finalStatus = resolveStatus(record.checkIn, record.checkOut, lateStatus);
      
      // Update if status or lateMinutes changed
      if (record.status !== finalStatus || record.lateMinutes !== lateMinutes) {
        await prisma.attendance.update({
          where: { id: record.id },
          data: { status: finalStatus, lateMinutes }
        });
        updatedCount++;
      }
    }

    res.json({ 
      success: true, 
      message: `Recalculation complete. ${updatedCount} records updated.`,
      data: { totalChecked: records.length, updated: updatedCount }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/attendance/swap-days
 * Swap/Move attendance data from one date to another date
 */
const swapDays = async (req, res) => {
  try {
    const { sourceDate, targetDate } = req.body;
    
    if (!sourceDate || !targetDate) {
      return res.status(400).json({ success: false, message: 'Source and Target dates are required' });
    }

    const sDate = new Date(sourceDate);
    const tDate = new Date(targetDate);
    
    const sStart = new Date(Date.UTC(sDate.getFullYear(), sDate.getMonth(), sDate.getDate()));
    const sEnd = new Date(sStart);
    sEnd.setUTCDate(sEnd.getUTCDate() + 1);
    
    const tStart = new Date(Date.UTC(tDate.getFullYear(), tDate.getMonth(), tDate.getDate()));
    const tEnd = new Date(tStart);
    tEnd.setUTCDate(tEnd.getUTCDate() + 1);

    const sourceRecords = await prisma.attendance.findMany({
      where: { date: { gte: sStart, lt: sEnd } },
      include: { employee: { include: { shift: true } } }
    });

    if (sourceRecords.length === 0) {
      return res.status(404).json({ success: false, message: 'Tidak ada data absensi pada Tanggal Sumber.' });
    }

    let movedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const src of sourceRecords) {
        if (!src.checkIn && !src.checkOut) {
          // If totally empty, just delete it so it stays clean
          await tx.attendance.delete({ where: { id: src.id } });
          continue;
        }

        let newCheckIn = null;
        let newCheckOut = null;
        
        if (src.checkIn) {
          newCheckIn = new Date(src.checkIn);
          newCheckIn.setUTCFullYear(tDate.getFullYear(), tDate.getMonth(), tDate.getDate());
        }
        
        if (src.checkOut) {
          newCheckOut = new Date(src.checkOut);
          newCheckOut.setUTCFullYear(tDate.getFullYear(), tDate.getMonth(), tDate.getDate());
        }

        const shiftStart = src.employee.shift?.startTime || '08:00';
        const gracePeriod = src.employee.shift?.gracePeriod || 15;
        
        let lateStatus = 'PRESENT';
        let lateMinutes = 0;
        if (newCheckIn) {
          const calc = calculateLateness(newCheckIn, shiftStart, gracePeriod);
          lateStatus = calc.status;
          lateMinutes = calc.lateMinutes;
        }

        const newStatus = resolveStatus(newCheckIn, newCheckOut, lateStatus);

        // Remove any conflicting records on target date
        await tx.attendance.deleteMany({
          where: { employeeId: src.employeeId, date: { gte: tStart, lt: tEnd } }
        });

        // Insert new moved record
        await tx.attendance.create({
          data: {
            employeeId: src.employeeId,
            date: tStart,
            checkIn: newCheckIn,
            checkOut: newCheckOut,
            status: newStatus,
            lateMinutes,
            overtimeHours: src.overtimeHours,
            mode: src.mode
          }
        });

        // Delete the original
        await tx.attendance.delete({ where: { id: src.id } });

        movedCount++;
      }
    }, {
      maxWait: 5000,
      timeout: 20000 // 20s timeout for mass moves
    });

    res.json({
      success: true,
      message: `Berhasil memindahkan ${movedCount} data absensi.`,
      data: { moved: movedCount }
    });
  } catch (err) {
    console.error('Swap Days Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/attendance/master-options
 * Get unique organizational options based on existing attendance records in a date range
 */
const getMasterOptions = async (req, res) => {
  try {
    const { period, date, startDate, endDate, dept, search } = req.query;
    const where = {};

    // 1. Logic for Date filtering (reuse from getAll)
    const now = new Date();
    if (period === 'Today' || (!period && !date && !startDate)) {
      const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      where.date = { gte: today, lt: tomorrow };
    } else if (period === 'This Week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      where.date = { gte: startOfWeek, lte: now };
    } else if (period === 'This Month') {
      const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      where.date = { gte: startOfMonth, lte: now };
    } else if (period === 'Custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    } else if (date) {
      const d = new Date(date);
      const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const next = new Date(start);
      next.setUTCDate(next.getUTCDate() + 1);
      where.date = { gte: start, lt: next };
    }

    // 2. Query Employees who have attendance in the range
    // Optimization: Use 'distinct' to get unique combinations directly from DB
    const employeeWhere = {
      attendance: { some: where },
      status: 'ACTIVE'
    };

    if (dept && dept !== '') {
      employeeWhere.department = { name: dept };
    }
    if (search && search.trim()) {
      employeeWhere.name = { contains: search.trim(), mode: 'insensitive' };
    }

    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      select: {
        department: { select: { id: true, name: true } },
        section: true,
        position: true,
        attendance: {
          where: where,
          select: { status: true }
        }
      },
      distinct: ['departmentId', 'section', 'position']
    });

    // 3. Flatten and unique for response
    const departmentsMap = new Map();
    const sectionsSet = new Set();
    const positionsSet = new Set();
    const statusesSet = new Set();

    const attendanceRecords = await prisma.attendance.findMany({
      where: where,
      select: { status: true, checkIn: true, checkOut: true }
    });

    attendanceRecords.forEach(a => {
      let resolved = resolveStatus(a.checkIn, a.checkOut, a.status);
      if (resolved) statusesSet.add(resolved);
    });

    employees.forEach(e => {
      if (e.department) departmentsMap.set(e.department.id, e.department.name);
      if (e.section) sectionsSet.add(e.section);
      if (e.position) positionsSet.add(e.position);
    });

    res.json({
      success: true,
      data: {
        departments: Array.from(departmentsMap.entries()).map(([id, name]) => ({ id, name })),
        sections: Array.from(sectionsSet).filter(Boolean).sort(),
        positions: Array.from(positionsSet).filter(Boolean).sort(),
        statuses: Array.from(statusesSet).filter(Boolean).sort(),
      }
    });
  } catch (err) {
    console.error('Error fetching attendance options:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/attendance/manual
 */
const createManual = async (req, res) => {
  try {
    const { employeeId, date, status, notes } = req.body;

    if (!employeeId || !date || !status) {
      return res.status(400).json({ success: false, message: 'Employee, date, and status are required' });
    }

    const employee = await prisma.employee.findUnique({ where: { id: parseInt(employeeId) } });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const [y, m, d] = date.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));

    const record = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: parseInt(employeeId), date: dateObj } },
      update: { status, notes, mode: 'Manual' },
      create: { employeeId: parseInt(employeeId), date: dateObj, status, notes, mode: 'Manual' },
    });

    res.json({ success: true, message: 'Attendance record created/updated manually', data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const downloadTemplate = async (req, res) => {
  try {
    const workbook = XLSX.utils.book_new();
    const worksheetData = [
      ['ID Number', 'Name', 'Date (YYYY-MM-DD)', 'Time (HH:mm)', 'Status (In/Out)'],
      ['14059', 'M. Faizal Akbar', '2026-04-01', '08:00', 'In'],
      ['14059', 'M. Faizal Akbar', '2026-04-01', '17:00', 'Out']
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance_template.xlsx');
    res.send(buffer);
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, overtimeHours, checkInTime, checkOutTime, lateMinutes, attachment } = req.body;
    
    const validStatuses = ['PRESENT', 'LATE', 'ABSENT', 'MANGKIR', 'SAKIT', 'IZIN', 'CUTI', 'HOLIDAY'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Get the old record to retrieve the base date and for audit comparison
    const oldRecord = await prisma.attendance.findUnique({ where: { id: parseInt(id) }, include: { employee: true } });
    if (!oldRecord) {
       return res.status(404).json({ success: false, message: 'Record not found' });
    }
    
    const updateData = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes || null;
    if (overtimeHours !== undefined) updateData.overtimeHours = parseFloat(overtimeHours) || 0;
    
    // Process Lateness Waiver
    if (lateMinutes !== undefined) {
      updateData.lateMinutes = parseInt(lateMinutes);
    }

    // Process File Attachment (Correction Form / Doc)
    if (attachment !== undefined) {
      updateData.photoUrl = attachment || null;
    }

    // Manual Time Update Parsing
    if (checkInTime || checkOutTime) {
      const baseDate = new Date(oldRecord.date);
      
      if (checkInTime) {
        const [h, m] = checkInTime.split(':').map(Number);
        const newCheckIn = new Date(baseDate);
        newCheckIn.setUTCHours(h - 7, m, 0, 0); // Assuming frontend sends local time (UTC+7 usually, wait! Simple manual adjust using UTC setHours) 
        // Actually, it's safer to just parse it as local time of the server or timezone.
        // Let's use simple local setHours because node runs on local time
        const safeCI = new Date(baseDate);
        safeCI.setHours(h, m, 0, 0);
        updateData.checkIn = safeCI;
      }
      
      if (checkOutTime) {
        const [h, m] = checkOutTime.split(':').map(Number);
        const safeCO = new Date(baseDate);
        safeCO.setHours(h, m, 0, 0);
        updateData.checkOut = safeCO;
      }
    }

    const record = await prisma.attendance.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    // Record detailed audit
    if (req.user) {
      const { recordAuditLog } = require('../utils/auditLogger');
      try {
         await recordAuditLog({
           userId: req.user.id,
           username: req.user.username,
           role: req.user.role,
           action: 'CORRECTION',
           entity: 'Attendance',
           entityId: parseInt(id),
           details: JSON.stringify({ 
             employee: oldRecord?.employee?.name, 
             oldStatus: oldRecord?.status, newStatus: status, 
             lateFixed: lateMinutes !== undefined ? lateMinutes : oldRecord?.lateMinutes,
             timesFixed: !!(checkInTime || checkOutTime),
             hasAttachment: !!attachment,
             notes 
           }),
           ipAddress: req.ip,
         });
      } catch(e) { } // silent on audit error
    }

    res.json({ success: true, message: 'Data absensi berhasil dikoreksi HRD', data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PATCH /api/attendance/bulk-overtime
 */
const bulkUpdateOvertime = async (req, res) => {
  try {
    const { date, records } = req.body;
    if (!date || !records || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const d = new Date(date);
    const dateObj = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0));

    let updatedCount = 0;
    
    // Process sequentially to record distinct audit logs and upsert attendance limits
    for (const rec of records) {
      if (rec.overtimeHours === undefined || rec.overtimeHours === null || rec.overtimeHours === '') continue;
      
      const attendance = await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: rec.employeeId, date: dateObj } },
        update: { overtimeHours: parseFloat(rec.overtimeHours) },
        create: {
          employeeId: rec.employeeId,
          date: dateObj,
          status: 'ABSENT', // they might not have clocked in, but admin gave them overtime?
          overtimeHours: parseFloat(rec.overtimeHours),
          mode: 'Manual (SPL)'
        },
        include: { employee: true }
      });
      updatedCount++;

      // Record detailed audit
      if (req.user) {
        const { recordAuditLog } = require('./auditLogController');
        try {
           await recordAuditLog({
             userId: req.user.id,
             username: req.user.username,
             role: req.user.role,
             action: 'UPDATE_SPL',
             entity: 'Attendance',
             entityId: attendance.id,
             details: JSON.stringify({ 
               logMsg: `${attendance.employee.name} (NIK: ${attendance.employee.employeeCode}): Lembur (SPL) diupdate menjadi ${rec.overtimeHours} Jam (Tgl: ${date})`
             }),
             ipAddress: req.ip,
           });
        } catch(e) { }
      }
    }

    res.json({ success: true, message: `Berhasil meng-update jam lembur manual untuk ${updatedCount} karyawan.`, updatedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/attendance/bulk-daily-workers
 */
const bulkUpdateDailyWorkers = async (req, res) => {
  try {
    const { date, records } = req.body;
    if (!date || !records || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const d = new Date(date);
    const dateObj = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0));

    let updatedCount = 0;
    
    for (const rec of records) {
      if (!rec.status) continue;
      
      const attendance = await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: rec.employeeId, date: dateObj } },
        update: { status: rec.status, mode: 'Manual (BHL)' },
        create: {
          employeeId: rec.employeeId,
          date: dateObj,
          status: rec.status,
          mode: 'Manual (BHL)'
        },
        include: { employee: true }
      });
      updatedCount++;

      // Record detailed audit
      if (req.user) {
        const { recordAuditLog } = require('./auditLogController');
        try {
           await recordAuditLog({
             userId: req.user.id,
             username: req.user.username,
             role: req.user.role,
             action: 'UPDATE_BHL',
             entity: 'Attendance',
             entityId: attendance.id,
             details: JSON.stringify({ 
               logMsg: `${attendance.employee.name} (NIK: ${attendance.employee.employeeCode}): Absen Manual (BHL) diinput - ${rec.status} (Tgl: ${date})`
             }),
             ipAddress: req.ip,
           });
        } catch(e) { }
      }
    }

    res.json({ success: true, message: `Berhasil memproses absen Harian/BHL untuk ${updatedCount} karyawan.`, updatedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


module.exports = {
  getAll,
  checkIn,
  checkOut,
  getSummary,
  getHistory,
  importFromExcel,
  getImportProgress,
  recalculate,
  swapDays,
  getMasterOptions,
  createManual,
  downloadTemplate,
  update,
  bulkUpdateOvertime,
  bulkUpdateDailyWorkers
};
