const prisma = require('../prismaClient');
const { calculateLateness, resolveStatus } = require('../utils/lateCalculator');
const { getDistance } = require('../utils/geo');
const XLSX = require('xlsx');

/**
 * GET /api/attendance
 */
const getAll = async (req, res) => {
  try {
    const { search, dept, section, position, status, date, period, startDate, endDate } = req.query;

    // Fetch Global Settings (Working Days)
    const settingsList = await prisma.settings.findMany();
    const workingDaysSetting = settingsList.find(s => s.key === 'workingDays')?.value || '[1,2,3,4,5]';
    const workingDays = JSON.parse(workingDaysSetting);

    const where = {};

    // Date filtering
    const now = new Date();
    if (period === 'Today' || (!period && !date && !startDate)) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      where.date = { gte: today, lt: tomorrow };
    } else if (period === 'This Week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      where.date = { gte: startOfWeek, lte: now };
    } else if (period === 'This Month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      where.date = { gte: startOfMonth, lte: now };
    } else if (period === 'Custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    } else if (date) {
      const d = new Date(date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.date = { gte: d, lt: next };
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

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // 3. Dynamic Summary Calculation
    // Use aggregate logic to get counts for different statuses
    const [total, records, hadirCount, telatCount, mangkirCount, absenCount, holidayCount] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        include: { employee: { include: { department: true } } },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      // Hadir: Status PRESENT
      prisma.attendance.count({ where: { ...where, status: 'PRESENT', NOT: [{ checkIn: null }, { checkOut: null }] } }),
      // Telat: Status LATE
      prisma.attendance.count({ where: { ...where, status: 'LATE', NOT: [{ checkIn: null }, { checkOut: null }] } }),
      // Mangkir: Logical MANGKIR (One of them is null)
      prisma.attendance.count({ 
        where: { 
          ...where, 
          OR: [
            { AND: [{ checkIn: null }, { NOT: { checkOut: null } }] },
            { AND: [{ NOT: { checkIn: null } }, { checkOut: null }] }
          ]
        } 
      }),
      // Absen: Logical ABSENT (Both are null AND not a known special status)
      prisma.attendance.count({ 
        where: { 
          ...where, 
          checkIn: null, 
          checkOut: null,
          status: { notIn: ['HOLIDAY', 'CUTI', 'SAKIT', 'IZIN'] }
        } 
      }),
      // Holiday: Specifically HOLIDAY status
      prisma.attendance.count({ where: { ...where, status: 'HOLIDAY' } }),
    ]);

    const summary = {
      total: total,
      hadir: hadirCount,
      telat: telatCount,
      mangkir: mangkirCount,
      absen: absenCount,
      holiday: holidayCount,
    };

    res.json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary,
      data: records.map(r => {
        const recordDay = new Date(r.date).getDay();
        const isWorkingDay = workingDays.includes(recordDay);
        
        let finalStatus = r.status;
        if (!isWorkingDay && !r.checkIn && !r.checkOut && r.status === 'ABSENT') {
          finalStatus = 'HOLIDAY';
        }

        return {
          id: r.id,
          name: r.employee.name,
          dept: r.employee.department.name,
          section: r.employee.section,
          position: r.employee.position,
          date: r.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          checkIn: r.checkIn ? r.checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-- : --',
          checkOut: r.checkOut ? r.checkOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-- : --',
          status: resolveStatus(r.checkIn, r.checkOut, finalStatus) === 'PRESENT' ? 'Present' : 
                  resolveStatus(r.checkIn, r.checkOut, finalStatus) === 'LATE' ? 'Late' : 
                  resolveStatus(r.checkIn, r.checkOut, finalStatus) === 'MANGKIR' ? 'Mangkir' : 
                  resolveStatus(r.checkIn, r.checkOut, finalStatus) === 'HOLIDAY' ? 'Holiday' : 
                  resolveStatus(r.checkIn, r.checkOut, finalStatus) === 'CUTI' ? 'Cuti' : 'Absent',
          lateMinutes: r.lateMinutes,
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
    const { employeeId, mode, lat, lng } = req.body;

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

      // 1. Accuracy Check (Max 50m)
      if (accuracy && accuracy > 50) {
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
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
      update: { checkIn: now, status, lateMinutes, mode },
      create: { employeeId, date: today, checkIn: now, status, lateMinutes, mode },
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
    const { employeeId } = req.body;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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

    // Recalculate status now that we have both checkIn and checkOut
    const shiftStart = attendance.employee?.shift?.startTime || '08:00';
    const gracePeriod = attendance.employee?.shift?.gracePeriod || 15;
    let lateStatus = 'PRESENT';
    let lateMinutes = 0;
    
    if (attendance.checkIn) {
      const calc = calculateLateness(attendance.checkIn, shiftStart, gracePeriod);
      lateStatus = calc.status;
      lateMinutes = calc.lateMinutes;
    }

    const finalStatus = resolveStatus(attendance.checkIn, now, lateStatus);

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { checkOut: now, status: finalStatus },
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
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

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
      const start = new Date(parseInt(year), parseInt(month) - 1, 1);
      const end = new Date(parseInt(year), parseInt(month), 0);
      where.date = { gte: start, lte: end };
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 31,
    });

    res.json({
      success: true,
      data: records.map(r => ({
        day: r.date.getDate().toString().padStart(2, '0'),
        weekday: r.date.toLocaleDateString('en-US', { weekday: 'short' }),
        in: r.checkIn ? r.checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-- : --',
        out: r.checkOut ? r.checkOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-- : --',
        status: r.status === 'PRESENT' ? 'Present' : r.status === 'LATE' ? 'Late' : 'Absent',
        lateMinutes: r.lateMinutes,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
      idNumber: header.findIndex(h => h.includes('id number') || h.includes('idnumber')),
      verifyCode: header.findIndex(h => h.includes('verify')),
      cardNo: header.findIndex(h => h.includes('card')),
    };

    if (colMap.dateTime === -1 || colMap.status === -1) {
      return res.status(400).json({ success: false, message: 'Cannot detect Date/Time or Status column in Excel' });
    }
    if (colMap.idNumber === -1 && colMap.name === -1) {
      return res.status(400).json({ success: false, message: 'Cannot detect ID Number or Name column for employee matching' });
    }

    // Parse all data rows
    const dataRows = rows.slice(1).filter(r => r && r.length > 0);
    
    // Group by employee+date
    // Key: employeeCode|date -> { checkIn, checkOut, employeeName, dept }
    const grouped = {};
    const unmatchedNames = new Set();

    // Pre-fetch all employees for fast lookup
    const allEmployees = await prisma.employee.findMany({
      select: { id: true, employeeCode: true, name: true, shiftId: true, shift: true },
    });
    const empByCode = {};
    const empByName = {};
    allEmployees.forEach(e => {
      empByCode[e.employeeCode] = e;
      empByName[e.name.toLowerCase().trim()] = e;
    });

    for (const row of dataRows) {
      const rawDateTime = row[colMap.dateTime];
      const statusStr = (row[colMap.status] || '').toString().trim().toLowerCase();
      const idNumber = colMap.idNumber >= 0 ? (row[colMap.idNumber] || '').toString().trim() : '';
      const empName = colMap.name >= 0 ? (row[colMap.name] || '').toString().trim() : '';

      if (!rawDateTime || (!statusStr.includes('in') && !statusStr.includes('out'))) continue;

      // Parse datetime
      let dt;
      if (typeof rawDateTime === 'number') {
        // Excel serial date
        dt = new Date(Math.round((rawDateTime - 25569) * 86400 * 1000));
      } else {
        dt = new Date(rawDateTime.toString());
      }
      if (isNaN(dt.getTime())) continue;

      // Match employee: prefer by employeeCode (idNumber), fallback to name
      let emp = empByCode[idNumber] || empByName[empName.toLowerCase().trim()] || null;
      if (!emp) {
        unmatchedNames.add(empName || idNumber);
        continue;
      }

      const dateKey = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      const groupKey = `${emp.id}|${dateKey}`;

      if (!grouped[groupKey]) {
        grouped[groupKey] = { employeeId: emp.id, employee: emp, date: dateKey, checkIn: null, checkOut: null };
      }

      if (statusStr.includes('in')) {
        // Keep earliest check-in
        if (!grouped[groupKey].checkIn || dt < grouped[groupKey].checkIn) {
          grouped[groupKey].checkIn = dt;
        }
      } else if (statusStr.includes('out')) {
        // Keep latest check-out
        if (!grouped[groupKey].checkOut || dt > grouped[groupKey].checkOut) {
          grouped[groupKey].checkOut = dt;
        }
      }
    }

    // Upsert attendance records
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const [key, entry] of Object.entries(grouped)) {
      try {
        const dateObj = new Date(entry.date + 'T00:00:00');
        const emp = entry.employee;

        // Calculate lateness if check-in exists
        let lateStatus = 'PRESENT';
        let lateMinutes = 0;
        if (entry.checkIn) {
          const shiftStart = emp.shift?.startTime || '08:00';
          const gracePeriod = emp.shift?.gracePeriod || 15;
          const calc = calculateLateness(entry.checkIn, shiftStart, gracePeriod);
          lateStatus = calc.status;
          lateMinutes = calc.lateMinutes;
        }

        const status = resolveStatus(entry.checkIn, entry.checkOut, lateStatus);

        const existing = await prisma.attendance.findUnique({
          where: { employeeId_date: { employeeId: entry.employeeId, date: dateObj } },
        });

        if (existing) {
          // Update only if imported data has more info
          const updateData = {};
          if (entry.checkIn && !existing.checkIn) updateData.checkIn = entry.checkIn;
          if (entry.checkOut && !existing.checkOut) updateData.checkOut = entry.checkOut;
          if (entry.checkIn && !existing.checkIn) {
            updateData.status = status;
            updateData.lateMinutes = lateMinutes;
            updateData.mode = 'Fingerprint';
          }
          
          if (Object.keys(updateData).length > 0) {
            await prisma.attendance.update({ where: { id: existing.id }, data: updateData });
            updated++;
          } else {
            skipped++;
          }
        } else {
          await prisma.attendance.create({
            data: {
              employeeId: entry.employeeId,
              date: dateObj,
              checkIn: entry.checkIn || null,
              checkOut: entry.checkOut || null,
              status,
              lateMinutes,
              mode: 'Fingerprint',
            },
          });
          imported++;
        }
      } catch (err) {
        errors.push(`${key}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: `Import selesai: ${imported} baru, ${updated} diperbarui, ${skipped} dilewati`,
      data: {
        totalRows: dataRows.length,
        groupedRecords: Object.keys(grouped).length,
        imported,
        updated,
        skipped,
        unmatched: Array.from(unmatchedNames),
        errors: errors.slice(0, 10),
      },
    });
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
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      where.date = { gte: today, lt: tomorrow };
    } else if (period === 'This Week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      where.date = { gte: startOfWeek, lte: now };
    } else if (period === 'This Month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      where.date = { gte: startOfMonth, lte: now };
    } else if (period === 'Custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    } else if (date) {
      const d = new Date(date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.date = { gte: d, lt: next };
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

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

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

module.exports = { getAll, checkIn, checkOut, getSummary, getHistory, importFromExcel, recalculate, getMasterOptions, createManual };
