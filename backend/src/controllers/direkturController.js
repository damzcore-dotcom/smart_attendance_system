const prisma = require('../prismaClient');
const { resolveStatus, parsePenaltySettings } = require('../utils/lateCalculator');
const { handleControllerError } = require('../middleware/validate');
const { toUTCMidnight, getUTCToday, getUTCStartOfWeek, getUTCStartOfMonth, getUTCEndOfDay } = require('../utils/dateHelper');


// GET /api/direktur/stats — Summary statistics
const getStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const [totalEmployees, presentToday, lateToday, pendingLeave, absentToday] = await Promise.all([
      prisma.employee.count({ where: { status: 'ACTIVE' } }),
      prisma.attendance.count({ where: { date: { gte: today, lte: todayEnd }, status: { in: ['PRESENT', 'LATE'] } } }),
      prisma.attendance.count({ where: { date: { gte: today, lte: todayEnd }, status: 'LATE' } }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.attendance.count({ where: { date: { gte: today, lte: todayEnd }, status: { in: ['ABSENT', 'MANGKIR'] } } }),
    ]);

    res.json({
      success: true,
      data: { totalEmployees, presentToday, lateToday, pendingLeave, absentToday }
    });
  } catch (err) {
    handleControllerError(res, err, 'direkturController.getStats');
  }
};

// GET /api/direktur/attendance — All attendance records (read-only)
const getAttendance = async (req, res) => {
  try {
    const { 
      period = 'today', dept, status, search, section, position, 
      startDate, endDate, page = 1, limit = 50,
      sortBy = 'date', order = 'desc'
    } = req.query;

    let dateFilter = {};
    const now = new Date();
    if (period === 'today') {
      const today = getUTCToday();
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      dateFilter = { gte: today, lt: tomorrow };
    } else if (period === 'week') {
      const startOfWeek = getUTCStartOfWeek(now);
      dateFilter = { gte: startOfWeek, lte: toUTCMidnight(now) };
    } else if (period === 'month') {
      const startOfMonth = getUTCStartOfMonth(now);
      dateFilter = { gte: startOfMonth, lte: toUTCMidnight(now) };
    } else if (period === 'custom' && startDate && endDate) {
      const start = toUTCMidnight(new Date(startDate));
      const end = getUTCEndOfDay(toUTCMidnight(new Date(endDate)));
      dateFilter = { gte: start, lte: end };
    }

    const empWhere = { status: 'ACTIVE' };
    if (dept) empWhere.department = { name: dept };
    if (section) empWhere.section = section;
    if (position) empWhere.position = position;
    if (search) {
      empWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build orderBy
    let orderBy = [];
    if (sortBy === 'name') orderBy.push({ employee: { name: order } });
    else if (sortBy === 'nik') orderBy.push({ employee: { employeeCode: order } });
    else if (sortBy === 'dept') orderBy.push({ employee: { department: { name: order } } });
    else if (sortBy === 'date') orderBy.push({ date: order });
    else if (sortBy === 'checkIn') orderBy.push({ checkIn: order });
    else if (sortBy === 'checkOut') orderBy.push({ checkOut: order });
    else if (sortBy === 'status') orderBy.push({ status: order });
    else orderBy.push({ date: 'desc' }, { employee: { name: 'asc' } });

    // Logic for Mangkir (Absent)
    if (status === 'Absent' || status === 'ABSENT') {
      const allEmployees = await prisma.employee.findMany({
        where: empWhere,
        include: { department: true }
      });

      const attendedIds = (await prisma.attendance.findMany({
        where: { date: dateFilter, employee: empWhere },
        select: { employeeId: true }
      })).map(a => a.employeeId);

      let absentList = allEmployees.filter(e => !attendedIds.includes(e.id));
      
      // Sort absentList in memory
      if (sortBy === 'name') {
        absentList.sort((a, b) => order === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
      } else if (sortBy === 'nik') {
        absentList.sort((a, b) => order === 'asc' ? a.employeeCode.localeCompare(b.employeeCode) : b.employeeCode.localeCompare(a.employeeCode));
      } else if (sortBy === 'dept') {
        absentList.sort((a, b) => {
          const da = a.department?.name || '';
          const db = b.department?.name || '';
          return order === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
        });
      }

      const total = absentList.length;
      const paginated = absentList.slice(skip, skip + parseInt(limit));

      const finalData = paginated.map(e => ({
        id: `absent-${e.id}`,
        date: (dateFilter.gte || new Date()).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }),
        nik: e.employeeCode,
        name: e.name,
        dept: e.department?.name || '-',
        section: e.section || '-',
        position: e.position || '-',
        checkIn: '-',
        checkOut: '-',
        status: 'ABSENT',
        lateMinutes: 0,
        mode: '-',
        source: 'manual'
      }));

      return res.json({ success: true, data: finalData, total, totalPages: Math.ceil(total / limit) });
    }

    const where = {
      ...(Object.keys(dateFilter).length && { date: dateFilter }),
      employee: empWhere
    };

    if (status) {
      const statusMap = {
        'Present': 'PRESENT',
        'Late': 'LATE',
        'Mangkir': 'MANGKIR',
        'Missing': 'MANGKIR',
        'Absent': 'ABSENT',
        'Alpa': 'ABSENT',
        'Holiday': 'HOLIDAY',
        'Cuti': 'CUTI',
        'Sakit': 'SAKIT',
        'Izin': 'IZIN',
        'Early Departure': 'EARLY_DEPARTURE',
        'Pulang Cepat': 'EARLY_DEPARTURE'
      };
      const statusValues = status.split(',').map(s => {
        const trimmed = s.trim();
        return statusMap[trimmed] || trimmed.toUpperCase();
      });
      if (statusValues.length === 1) {
        where.status = statusValues[0];
      } else {
        where.status = { in: statusValues };
      }
    }

    const [records, total, calendarOverrides, rosterOverrides] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy,
        include: {
          employee: {
            include: { department: true, shift: true }
          }
        }
      }),
      prisma.attendance.count({ where }),
      prisma.companyCalendar.findMany({
        where: where.date ? { date: where.date } : {}
      }),
      prisma.employeeShiftOverride.findMany({
        where: where.date ? {
          startDate: { lte: where.date.lt || where.date.lte || now },
          endDate: { gte: where.date.gte || now }
        } : {},
        select: {
          employeeId: true,
          startDate: true,
          endDate: true,
          shift: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              saturdayType: true,
              saturdayEndTime: true,
              gracePeriod: true
            }
          }
        }
      })
    ]);

    const overrideMap = {};
    if (calendarOverrides) {
      calendarOverrides.forEach(c => {
        overrideMap[c.date.toISOString().split('T')[0]] = c;
      });
    }

    const rosterMap = new Map();
    if (rosterOverrides) {
      for (const ov of rosterOverrides) {
        let d = new Date(ov.startDate);
        const endD = new Date(ov.endDate);
        while (d <= endD) {
          const dStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
          rosterMap.set(`${ov.employeeId}_${dStr}`, ov.shift);
          d.setUTCDate(d.getUTCDate() + 1);
        }
      }
    }

    // Standardized summary calculation to match Admin portal
    const allRecordsForSummary = await prisma.attendance.findMany({
      where,
      include: {
        employee: {
          include: {
            shift: true
          }
        }
      }
    });

    // Fetch working days and penalty settings
     const settings = await prisma.settings.findMany();
     const { penaltyRules } = parsePenaltySettings(settings);
     const workingDaysSetting = settings.find(s => s.key === 'workingDays');
     const workingDays = workingDaysSetting ? JSON.parse(workingDaysSetting.value) : [1, 2, 3, 4, 5];
     const isSaturdayHalfDay = settings.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
     const satCheckoutTime = settings.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
     const defaultShiftStart = settings.find(s => s.key === 'defaultShiftStart')?.value || '08:00';
     const defaultShiftEnd = settings.find(s => s.key === 'defaultShiftEnd')?.value || '17:00';

    const summary = {
      total: allRecordsForSummary.length,
      hadir: 0, telat: 0, mangkir: 0, absen: 0, holiday: 0, cuti: 0, sakit: 0, izin: 0, earlyDeparture: 0, totalLate: 0, uniqueEmployeeCount: 0,
      // Expose the configured mangkir penalty so the frontend shows the same value
      // it uses in summary.totalLate instead of a hardcoded 30 (PERBAIKAN_MODE_KARYAWAN.md / leadership review).
      mangkirPenalty: penaltyRules?.rule1Minutes || 30
    };

    const uniqueEmps = new Set();

    allRecordsForSummary.forEach(r => {
      const empShift = r.employee?.shift;
      const shiftStart = empShift?.startTime || defaultShiftStart;
      let shiftEnd = empShift?.endTime || defaultShiftEnd;
      const recordDay = r.date.getUTCDay();
      
      // Apply Saturday shift end time override
      if (recordDay === 6) {
        const satType = empShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
        if (satType === 'HALF_DAY') {
          shiftEnd = empShift?.saturdayEndTime || satCheckoutTime;
        }
      }

      let resolved = resolveStatus(r.checkIn, r.checkOut, r.status, r.date, penaltyRules, shiftEnd, shiftStart);

      // Apply HOLIDAY override logic
      if (resolved === 'MANGKIR' || resolved === 'ABSENT' || resolved === 'HOLIDAY') {
        const dateStr = r.date.toISOString().split('T')[0];
        const override = overrideMap[dateStr];
        
        const rosterShift = rosterMap.get(`${r.employeeId}_${dateStr}`);
        const effectiveShift = rosterShift || r.employee?.shift || null;
        
        let isLibur = false;
        if (override) {
           if (override.type === 'HOLIDAY') isLibur = true;
           if (override.type === 'WORKDAY') isLibur = false;
        } else {
           if (recordDay === 6 && effectiveShift) {
             isLibur = effectiveShift.saturdayType === 'OFF';
           } else {
             isLibur = !workingDays.includes(recordDay);
           }
        }
        
        if (isLibur) {
           resolved = 'HOLIDAY';
        }
      }

      if (resolved === 'PRESENT') summary.hadir++;
      else if (resolved === 'LATE') { summary.telat++; summary.totalLate += (r.lateMinutes || 0); }
      else if (resolved === 'MANGKIR') { 
        summary.mangkir++; 
        const penalty = ((r.lateMinutes || 0) > 0 ? r.lateMinutes : (!r.checkIn ? penaltyRules.rule1Minutes : penaltyRules.rule3Minutes));
        summary.totalLate += penalty; 
      }
      else if (resolved === 'HOLIDAY') summary.holiday++;
      else if (resolved === 'CUTI') summary.cuti++;
      else if (resolved === 'SAKIT') summary.sakit++;
      else if (resolved === 'IZIN') summary.izin++;
      else if (resolved === 'EARLY_DEPARTURE') { summary.earlyDeparture++; summary.totalLate += (r.lateMinutes || 0); }
      else summary.absen++;
      
      uniqueEmps.add(r.employeeId);
    });
    summary.uniqueEmployeeCount = uniqueEmps.size;

    res.json({
      success: true,
      data: records.map(att => {
        const empShift = att.employee?.shift;
        const shiftStart = empShift?.startTime || defaultShiftStart;
        let shiftEnd = empShift?.endTime || defaultShiftEnd;
        const recordDay = att.date.getUTCDay();

        // Apply Saturday shift end time override
        if (recordDay === 6) {
          const satType = empShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
          if (satType === 'HALF_DAY') {
            shiftEnd = empShift?.saturdayEndTime || satCheckoutTime;
          }
        }

        let resolved = resolveStatus(att.checkIn, att.checkOut, att.status, att.date, penaltyRules, shiftEnd, shiftStart);

        // Apply HOLIDAY override logic
        if (resolved === 'MANGKIR' || resolved === 'ABSENT' || resolved === 'HOLIDAY') {
          const dateStr = att.date.toISOString().split('T')[0];
          const override = overrideMap[dateStr];
          
          const rosterShift = rosterMap.get(`${att.employee.id}_${dateStr}`);
          const effectiveShift = rosterShift || att.employee?.shift || null;
          
          let isLibur = false;
          if (override) {
             if (override.type === 'HOLIDAY') isLibur = true;
             if (override.type === 'WORKDAY') isLibur = false;
          } else {
             if (recordDay === 6 && effectiveShift) {
               isLibur = effectiveShift.saturdayType === 'OFF';
             } else {
               isLibur = !workingDays.includes(recordDay);
             }
          }
          
          if (isLibur) {
             resolved = 'HOLIDAY';
             att.lateMinutes = 0;
          }
        }
        
        let displayStatus = 'Alpa';
        if (resolved === 'PRESENT') displayStatus = 'Present';
        else if (resolved === 'LATE') displayStatus = 'Late';
        else if (resolved === 'MANGKIR') displayStatus = 'Mangkir';
        else if (resolved === 'HOLIDAY') displayStatus = 'Holiday';
        else if (resolved === 'EARLY_DEPARTURE') displayStatus = 'Early Departure';
        else if (resolved === 'CUTI') displayStatus = 'Leave';
        else if (resolved === 'SAKIT') displayStatus = 'Medical';
        else if (resolved === 'IZIN') displayStatus = 'Permit';
        else if (resolved === 'ABSENT') displayStatus = 'Alpa';

        return {
          id: att.id,
          name: att.employee.name,
          employeeCode: att.employee.employeeCode,
          dept: att.employee.department?.name,
          section: att.employee.section,
          position: att.employee.position,
          date: att.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }),
          checkIn: att.checkIn ? att.checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '-- : --',
          checkOut: att.checkOut ? att.checkOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '-- : --',
          status: resolved,
          displayStatus: displayStatus,
          lateMinutes: att.lateMinutes,
          mode: att.mode,
          source: att.source,
        };
      }),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      summary
    });
  } catch (err) {
    handleControllerError(res, err, 'direkturController.getAttendance');
  }
};

// GET /api/direktur/leave — All leave requests (read-only)
const getLeave = async (req, res) => {
  try {
    const { status, dept, type, page = 1, limit = 50, sortBy = 'createdAt', order = 'desc' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      ...(status && status !== 'ALL' && { status }),
      ...(type && type !== 'ALL' && { type }),
      ...(dept && { employee: { department: { name: dept } } }),
    };

    // Build orderBy
    let orderBy = {};
    if (sortBy === 'name') orderBy = { employee: { name: order } };
    else if (sortBy === 'nik') orderBy = { employee: { employeeCode: order } };
    else if (sortBy === 'dept') orderBy = { employee: { department: { name: order } } };
    else if (sortBy === 'type') orderBy = { type: order };
    else if (sortBy === 'status') orderBy = { status: order };
    else if (sortBy === 'startDate') orderBy = { startDate: order };
    else orderBy = { createdAt: order };

    const [records, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy,
        include: {
          employee: {
            select: {
              employeeCode: true,
              name: true,
              department: { select: { name: true } },
              position: true,
            }
          }
        }
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    const formatted = records.map(r => ({
      id: r.id,
      nik: r.employee.employeeCode,
      name: r.employee.name,
      dept: r.employee.department?.name || '-',
      position: r.employee.position || '-',
      type: r.type,
      startDate: r.startDate,
      endDate: r.endDate,
      duration: Math.ceil((new Date(r.endDate) - new Date(r.startDate)) / (1000*60*60*24)) + 1,
      reason: r.reason,
      status: r.status,
      reviewNote: r.reviewNote || '-',
      medicalAttachment: r.medicalAttachment,
      createdAt: r.createdAt,
    }));

    res.json({ success: true, data: formatted, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    handleControllerError(res, err, 'direkturController.getLeave');
  }
};

// GET /api/direktur/attendance-options — dynamic organizational options based on filters
const getAttendanceOptions = async (req, res) => {
  try {
    const { period, date, startDate, endDate, dept, search } = req.query;
    const where = {};

    // Date filtering (matching logic in /attendance)
    const now = new Date();
    if (period === 'today' || (!period && !date && !startDate)) {
      const today = getUTCToday();
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      where.date = { gte: today, lt: tomorrow };
    } else if (period === 'week') {
      const startOfWeek = getUTCStartOfWeek(now);
      where.date = { gte: startOfWeek, lte: toUTCMidnight(now) };
    } else if (period === 'month') {
      const startOfMonth = getUTCStartOfMonth(now);
      where.date = { gte: startOfMonth, lte: toUTCMidnight(now) };
    } else if (period === 'custom' && startDate && endDate) {
      const start = toUTCMidnight(new Date(startDate));
      const end = getUTCEndOfDay(toUTCMidnight(new Date(endDate)));
      where.date = { gte: start, lte: end };
    } else if (date) {
      const d = new Date(date);
      const start = toUTCMidnight(d);
      const next = new Date(start);
      next.setUTCDate(next.getUTCDate() + 1);
      where.date = { gte: start, lt: next };
    }

    const employeeWhere = {};
    if (dept && dept !== '') {
      employeeWhere.department = { name: dept };
    }
    if (search && search.trim()) {
      employeeWhere.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { employeeCode: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

     const settingsList = await prisma.settings.findMany();
     const { penaltyRules } = parsePenaltySettings(settingsList);
     const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
     const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
     const defaultShiftStart = settingsList.find(s => s.key === 'defaultShiftStart')?.value || '08:00';
     const defaultShiftEnd = settingsList.find(s => s.key === 'defaultShiftEnd')?.value || '17:00';

    const records = await prisma.attendance.findMany({
      where: { ...where, employee: employeeWhere },
      select: {
        checkIn: true,
        checkOut: true,
        status: true,
        date: true,
        employee: {
          select: {
            department: { select: { id: true, name: true } },
            section: true,
            position: true,
            shift: true
          }
        }
      }
    });

    const departments = new Map();
    const sections = new Set();
    const positions = new Set();
    const statuses = new Set();

    records.forEach(r => {
      if (r.employee.department) {
        departments.set(r.employee.department.id, r.employee.department.name);
      }
      if (r.employee.section) sections.add(r.employee.section);
      if (r.employee.position) positions.add(r.employee.position);
      
      // Resolve status for the list
      const empShift = r.employee?.shift;
      const shiftStart = empShift?.startTime || defaultShiftStart;
      let shiftEnd = empShift?.endTime || defaultShiftEnd;
      const recordDay = r.date.getUTCDay();

      // Apply Saturday shift end time override
      if (recordDay === 6) {
        const satType = empShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
        if (satType === 'HALF_DAY') {
          shiftEnd = empShift?.saturdayEndTime || satCheckoutTime;
        }
      }

      const s = resolveStatus(r.checkIn, r.checkOut, r.status, r.date, penaltyRules, shiftEnd, shiftStart);
      if (s === 'PRESENT') statuses.add('Present');
      else if (s === 'LATE') statuses.add('Late');
      else if (s === 'MANGKIR') statuses.add('Mangkir');
      else statuses.add('Absent');
    });

    res.json({
      success: true,
      data: {
        departments: Array.from(departments.entries()).map(([id, name]) => ({ id, name })),
        sections: Array.from(sections).sort(),
        positions: Array.from(positions).sort(),
        statuses: ['PRESENT', 'LATE', 'MANGKIR', 'HOLIDAY', 'CUTI', 'SAKIT', 'IZIN', 'ABSENT'],
      }
    });
  } catch (err) {
    handleControllerError(res, err, 'direkturController.getAttendanceOptions');
  }
};

// GET /api/direktur/weekly-trends
const getWeeklyTrends = async (req, res) => {
  try {
    const now = new Date();
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 1);
    weekEnd.setHours(0, 0, 0, 0);

    const records = await prisma.attendance.findMany({
      where: { 
        date: { gte: weekStart, lt: weekEnd },
        employee: {
          employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] },
          salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] }
        }
      },
      select: { date: true, status: true },
    });

    const dayMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      dayMap[key] = { name: dayLabels[d.getDay()], present: 0, late: 0, leave: 0 };
    }

    records.forEach(r => {
      const localD = new Date(r.date.getUTCFullYear(), r.date.getUTCMonth(), r.date.getUTCDate());
      const key = `${localD.getFullYear()}-${localD.getMonth()}-${localD.getDate()}`;
      if (dayMap[key]) {
        if (r.status === 'PRESENT') dayMap[key].present++;
        else if (r.status === 'LATE') dayMap[key].late++;
        else if (['IZIN', 'SAKIT', 'CUTI'].includes(r.status)) dayMap[key].leave++;
      }
    });

    res.json({ success: true, data: Object.values(dayMap) });
  } catch (err) {
    handleControllerError(res, err, 'direkturController.getWeeklyTrends');
  }
};

// GET /api/direktur/recent-late
const getRecentLate = async (req, res) => {
  try {
    const records = await prisma.attendance.findMany({
      where: { 
        status: 'LATE',
        employee: {
          employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] },
          salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] }
        }
      },
      include: { employee: { include: { department: true } } },
      orderBy: { checkIn: 'desc' },
      take: 5,
    });

    res.json({
      success: true,
      data: records.map(r => ({
        name: r.employee.name,
        dept: r.employee.department.name,
        lateMinutes: r.lateMinutes,
        checkIn: r.checkIn?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.employee.name}`,
      })),
    });
  } catch (err) {
    handleControllerError(res, err, 'direkturController.getRecentLate');
  }
};

// GET /api/direktur/departments — for backwards compatibility or simple list
const getDepartments = async (req, res) => {
  try {
    const depts = await prisma.department.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: depts });
  } catch (err) {
    handleControllerError(res, err, 'direkturController.getDepartments');
  }
};

module.exports = {
  getStats,
  getAttendance,
  getLeave,
  getAttendanceOptions,
  getWeeklyTrends,
  getRecentLate,
  getDepartments
};
