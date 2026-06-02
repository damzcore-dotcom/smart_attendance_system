const prisma = require('../prismaClient');
const { calculateLateness, resolveStatus, parsePenaltySettings } = require('../utils/lateCalculator');
const { toUTCMidnight, parseUTCDate, getUTCToday, getUTCYesterday, getUTCStartOfWeek, getUTCStartOfMonth, getUTCEndOfDay, VALID_STATUSES, MANGKIR_PENALTY_MINUTES } = require('../utils/dateHelper');
const { getDistance } = require('../utils/geo');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { recordAuditLog } = require('./auditLogController');


/**
 * GET /api/attendance
 */
const getAll = async (req, res) => {
  try {
    const { search, dept, section, position, status, date, period, startDate, endDate, sortBy, order } = req.query;

    // Fetch Global Settings (Working Days & Penalties)
    const settingsList = await prisma.settings.findMany();
    const workingDaysSetting = settingsList.find(s => s.key === 'workingDays')?.value || '[1,2,3,4,5]';
    const workingDays = JSON.parse(workingDaysSetting);
    const { penaltyRules, roundingConfig } = parsePenaltySettings(settingsList);
    const mangkirPenalty = penaltyRules.rule1Minutes; // Fallback / default

    const where = {};

    // Date filtering
    const now = new Date();
    if (period === 'Today' || (!period && !date && !startDate)) {
      const today = getUTCToday();
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      where.date = { gte: today, lt: tomorrow };
    } else if (period === 'This Week') {
      const startOfWeek = getUTCStartOfWeek(now);
      where.date = { gte: startOfWeek, lte: toUTCMidnight(now) };
    } else if (period === 'This Month') {
      const startOfMonth = getUTCStartOfMonth(now);
      where.date = { gte: startOfMonth, lte: toUTCMidnight(now) };
    } else if (period === 'Custom' && startDate && endDate) {
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

    // BHL Isolation Filters
    if (req.query.excludeBhl === 'true') {
      where.employee = {
        ...where.employee,
        employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] },
        salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] }
      };
    }

    if (req.query.onlyBhl === 'true') {
      where.employee = {
        ...where.employee,
        OR: [
          { employmentStatus: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } },
          { salaryCategory: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } }
        ]
      };
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
    const [total, records, groupStats, uniqueEmpRecords, absentRecords, calendarOverrides, rosterOverrides, mangkirNoInCount, mangkirNoOutCount] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        include: { employee: { include: { department: true, shift: true } } },
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
        select: { 
          date: true,
          employeeId: true,
          employee: {
            select: {
              shift: {
                select: {
                  saturdayType: true
                }
              }
            }
          }
        }
      }),
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
      }),
      prisma.attendance.count({
        where: { ...where, status: 'MANGKIR', lateMinutes: 0, checkIn: null }
      }),
      prisma.attendance.count({
        where: { ...where, status: 'MANGKIR', lateMinutes: 0, checkIn: { not: null } }
      })
    ]);

    let hadirCount = 0, telatCount = 0, mangkirCount = 0, absenCount = 0, holidayCount = 0, cutiCount = 0, sakitCount = 0, izinCount = 0, earlyDepartureCount = 0, totalLate = 0;

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
      else if (s === 'EARLY_DEPARTURE') earlyDepartureCount += count;
      else absenCount += count;

      if (s === 'MANGKIR') {
        totalLate += late + (mangkirNoInCount * penaltyRules.rule1Minutes) + (mangkirNoOutCount * penaltyRules.rule3Minutes);
      } else {
        totalLate += late;
      }
    });

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
          const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          rosterMap.set(`${ov.employeeId}_${dStr}`, ov.shift);
          d.setDate(d.getDate() + 1);
        }
      }
    }

    // Dynamically resolve HOLIDAY for ABSENT records based on working days settings & Calendar overrides & shift Saturday OFF rules
    absentRecords.forEach(r => {
      const dateStr = r.date.toISOString().split('T')[0];
      const override = overrideMap[dateStr];
      const recordDay = r.date.getUTCDay();
      
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
      earlyDeparture: earlyDepartureCount,
      totalLate: totalLate,
      uniqueEmployeeCount: uniqueEmpRecords.length,
      calendarOverrides: calendarOverrides, // Send to frontend
      workingDays: workingDays, // Send to frontend for accurate padding
      mangkirPenalty: mangkirPenalty, // Send penalty value to frontend
      penaltyRules: penaltyRules, // Send all penalty rules
      roundingConfig: roundingConfig, // Send rounding config
    };

    res.json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary,
      data: records.map(r => {
        // Use DB status directly — don't re-resolve, as resolveStatus can
        // incorrectly change LATE→MANGKIR when checkOut is missing mid-day
        let resolved = r.status;
        
        // Only apply HOLIDAY override logic
        if (resolved === 'MANGKIR' || resolved === 'ABSENT' || resolved === 'HOLIDAY') {
          const dateStr = r.date.toISOString().split('T')[0];
          const override = overrideMap[dateStr];
          const recordDay = r.date.getUTCDay();
          
          const rosterShift = rosterMap.get(`${r.employee.id}_${dateStr}`);
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
             r.lateMinutes = 0;
          }
        }

        return {
          id: r.id,
          name: r.employee.name,
          employeeCode: r.employee.employeeCode,
          employeeId: r.employee.id,
          dept: r.employee.department.name,
          section: r.employee.section,
          position: r.employee.position,
          date: r.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }),
          checkIn: r.checkIn ? r.checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '-- : --',
          checkOut: r.checkOut ? r.checkOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '-- : --',
          status: resolved,
          lateMinutes: r.lateMinutes,
          overtimeHours: r.overtimeHours,
          mode: r.mode,
          source: r.source,
          checkinPhotoUrl: r.checkinPhotoUrl,
          checkoutPhotoUrl: r.checkoutPhotoUrl,
          checkinSimilarity: r.checkinSimilarity,
          checkoutSimilarity: r.checkoutSimilarity,
          checkinCameraId: r.checkinCameraId,
          checkoutCameraId: r.checkoutCameraId,
          shiftName: r.employee.shift?.name || 'Default Shift',
          shiftTime: r.employee.shift ? `${r.employee.shift.startTime} - ${r.employee.shift.endTime}` : '08:00 - 17:00',
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
    const { mode, lat, lng, photoData } = req.body;
    let employeeId = req.body.employeeId;

    // Security: Validate employeeId from JWT token for non-admin users to prevent IDOR
    if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      employeeId = req.user.employeeId;
    }

    if (!employeeId) {
      return res.status(403).json({ success: false, message: 'No employee linked to this account' });
    }

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
    const today = getUTCToday();

    // Check if already checked in today
    const existing = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (existing && existing.checkIn) {
      return res.status(400).json({ success: false, message: 'Already checked in today' });
    }

    // Fetch global grace period setting
    const globalGracePeriod = parseInt(settings.find(s => s.key === 'gracePeriod')?.value || '15', 10);
    const isSaturdayHalfDay = settings.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
    const satCheckoutTime = settings.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';

    // Fetch shift overrides for today
    const dateStart = new Date(now);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(now);
    dateEnd.setHours(23, 59, 59, 999);
    const override = await prisma.employeeShiftOverride.findFirst({
      where: {
        employeeId,
        startDate: { lte: dateEnd },
        endDate: { gte: dateStart }
      },
      include: { shift: true }
    });
    const effectiveShift = override?.shift || employee.shift || null;

    // Calculate lateness
    const shiftStart = effectiveShift?.startTime || '08:00';
    let shiftEnd = effectiveShift?.endTime || '17:00';
    const gracePeriod = effectiveShift ? effectiveShift.gracePeriod : globalGracePeriod;

    // Apply Saturday Shift rules
    if (now.getDay() === 6) {
      const satType = effectiveShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
      if (satType === 'HALF_DAY') {
        shiftEnd = effectiveShift?.saturdayEndTime || satCheckoutTime;
      }
    }

    const { penaltyRules, roundingConfig } = parsePenaltySettings(settings);
    const { lateMinutes, status: lateStatus } = calculateLateness(now, shiftStart, gracePeriod, shiftEnd, roundingConfig);

    // Initial status for check-in is either PRESENT, LATE, or MANGKIR (if day ends)
    // But since this is a real-time check-in, if we don't have check-out yet, 
    // we show current status. resolveStatus will handle MANGKIR if we re-check later.
    const status = resolveStatus(now, existing?.checkOut, lateStatus, today, penaltyRules, shiftEnd, shiftStart);

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
    const { photoData, lat, lng } = req.body;
    let employeeId = req.body.employeeId;

    // Security: Validate employeeId from JWT token for non-admin users to prevent IDOR
    if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      employeeId = req.user.employeeId;
    }

    if (!employeeId) {
      return res.status(403).json({ success: false, message: 'No employee linked to this account' });
    }

    // H5 Fix: Log warning if GPS is not available during check-out
    if (!lat || !lng) {
      console.warn(`⚠️ [Security Warning] Employee ID ${employeeId} checked out WITHOUT GPS coordinates.`);
    } else {
      console.log(`[Checkout Log] Employee ID ${employeeId} checked out with GPS: lat=${lat}, lng=${lng}`);
    }

    const now = new Date();
    const today = getUTCToday();

    let attendance = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
      include: { employee: { include: { shift: true } } }
    });

    // C1 FIX: Night shift — if no record today, check yesterday (for employees who checked in last night)
    if ((!attendance || !attendance.checkIn) && now.getHours() < 12) {
      const yesterday = getUTCYesterday();
      const yesterdayRecord = await prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId, date: yesterday } },
        include: { employee: { include: { shift: true } } }
      });
      if (yesterdayRecord && yesterdayRecord.checkIn && !yesterdayRecord.checkOut) {
        attendance = yesterdayRecord;
      }
    }

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
    const timezoneOffset = parseInt(settingsList.find(s => s.key === 'timezoneOffset')?.value || '420', 10);

    // Fetch shift overrides for the attendance date
    const attendanceDate = new Date(attendance.date);
    const dateStart = new Date(attendanceDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(attendanceDate);
    dateEnd.setHours(23, 59, 59, 999);
    const override = await prisma.employeeShiftOverride.findFirst({
      where: {
        employeeId,
        startDate: { lte: dateEnd },
        endDate: { gte: dateStart }
      },
      include: { shift: true }
    });
    const effectiveShift = override?.shift || attendance.employee?.shift || null;

    // Recalculate status now that we have both checkIn and checkOut
    const shiftStart = effectiveShift?.startTime || '08:00';
    let shiftEnd = effectiveShift?.endTime || '17:00';
    const gracePeriod = effectiveShift ? effectiveShift.gracePeriod : (parseInt(settingsList.find(s => s.key === 'gracePeriod')?.value || '15', 10));
    
    // If today is Saturday (6) override shiftEnd according to Saturday Shift Protocol
    const dayOfWeek = attendanceDate.getUTCDay();
    if (dayOfWeek === 6) {
      const satType = effectiveShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
      if (satType === 'HALF_DAY') {
        shiftEnd = effectiveShift?.saturdayEndTime || satCheckoutTime;
      }
    }

    let lateStatus = 'PRESENT';
    let lateMinutes = 0;
    
    const { penaltyRules, roundingConfig } = parsePenaltySettings(settingsList);

    if (attendance.checkIn) {
      const calc = calculateLateness(attendance.checkIn, shiftStart, gracePeriod, shiftEnd, roundingConfig);
      lateStatus = calc.status;
      lateMinutes = calc.lateMinutes;
    }

    const finalStatus = resolveStatus(attendance.checkIn, now, lateStatus, attendance.date, penaltyRules, shiftEnd, shiftStart);

    // Calculate Overtime with timezone-independent calculation
    let overtimeHours = 0;
    const autoCalcOt = settingsList.find(s => s.key === 'autoCalculateOvertime')?.value !== 'false';
    const [endHour, endMinute] = shiftEnd.split(':').map(Number);
    
    const [startHour, startMinute] = shiftStart.split(':').map(Number);
    const startMins = startHour * 60 + startMinute;
    const endMins = endHour * 60 + endMinute;

    let targetEndMinutes = endMins;
    if (endMins < startMins) {
      // Shift crosses midnight (night shift)
      targetEndMinutes += 24 * 60;
    }

    // Dynamic timezone offset. Compute expectedEnd as exact UTC date/time.
    const expectedEnd = new Date(new Date(attendance.date).getTime() + (targetEndMinutes - timezoneOffset) * 60000);

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
    const today = getUTCToday();
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const totalEmployees = await prisma.employee.count({ where: { status: 'ACTIVE' } });

    const todayRecords = await prisma.attendance.findMany({
      where: { date: { gte: today, lt: tomorrow } },
    });

    const present = todayRecords.filter(r => r.status === 'PRESENT').length;
    const late = todayRecords.filter(r => r.status === 'LATE').length;
    const mangkir = todayRecords.filter(r => r.status === 'MANGKIR').length;
    const cuti = todayRecords.filter(r => r.status === 'CUTI').length;
    const sakit = todayRecords.filter(r => r.status === 'SAKIT').length;
    const izin = todayRecords.filter(r => r.status === 'IZIN').length;
    const holiday = todayRecords.filter(r => r.status === 'HOLIDAY').length;
    const absent = Math.max(0, totalEmployees - present - late - mangkir - cuti - sakit - izin - holiday);
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

    // Security: Prevent IDOR on history endpoint for non-admin/manager users
    if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'MANAGER' && req.user.role !== 'DIREKTUR') {
      if (empId !== req.user.employeeId) {
        return res.status(403).json({ success: false, message: 'You are not authorized to view this employee\'s history.' });
      }
    }

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

    const settings = await prisma.settings.findMany();
    const { penaltyRules: histPenaltyRules } = parsePenaltySettings(settings);

    res.json({
      success: true,
      data: records.map(r => ({
        day: r.date.getUTCDate().toString().padStart(2, '0'),
        weekday: r.date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
        in: r.checkIn ? r.checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '-- : --',
        out: r.checkOut ? r.checkOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '-- : --',
        status: r.status,
        lateMinutes: (r.status === 'MANGKIR' || r.status === 'MISSING')
          ? ((r.lateMinutes || 0) > 0 ? r.lateMinutes : (!r.checkIn ? histPenaltyRules.rule1Minutes : histPenaltyRules.rule3Minutes))
          : r.lateMinutes,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Global progress store for attendance import
// Database-backed progress tracking helpers (C3 Fix)
const updateImportProgress = async (jobId, progress, phase, detail) => {
  const key = `job_progress_${jobId}`;
  const value = JSON.stringify({ progress, phase, detail, updatedAt: new Date() });
  await prisma.settings.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
};

const getImportProgressFromDb = async (jobId) => {
  const key = `job_progress_${jobId}`;
  const record = await prisma.settings.findUnique({ where: { key } });
  if (!record) return null;
  try {
    return JSON.parse(record.value);
  } catch (e) {
    return null;
  }
};

const deleteImportProgress = async (jobId) => {
  const key = `job_progress_${jobId}`;
  await prisma.settings.deleteMany({ where: { key } });
};

/**
 * GET /api/attendance/import-progress
 * Poll the progress of an attendance import job
 */
const getImportProgress = async (req, res) => {
  const { jobId } = req.query;
  if (!jobId) {
    return res.json({ success: true, progress: 0, phase: 'idle', detail: '' });
  }
  const p = await getImportProgressFromDb(jobId);
  if (!p) {
    return res.json({ success: true, progress: 0, phase: 'idle', detail: '' });
  }
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
    const updateProgress = async (progress, phase, detail) => {
      await updateImportProgress(jobId, progress, phase, detail);
    };
    await updateProgress(5, 'reading', 'Membaca file Excel...');

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
    await updateProgress(10, 'parsing', `Membaca ${rows.length - 1} baris data...`);
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

    // Fetch global settings and overrides for Excel import
    const settingsList = await prisma.settings.findMany();
    const { penaltyRules, roundingConfig } = parsePenaltySettings(settingsList);
    const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
    const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
    const globalGracePeriod = parseInt(settingsList.find(s => s.key === 'gracePeriod')?.value || '15', 10);

    const allOverrides = await prisma.employeeShiftOverride.findMany({
      include: { shift: true }
    });
    const overrideMap = new Map();
    for (const ov of allOverrides) {
      let d = new Date(ov.startDate);
      const endD = new Date(ov.endDate);
      while (d <= endD) {
        const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        overrideMap.set(`${ov.employeeId}_${dStr}`, ov.shift);
        d.setDate(d.getDate() + 1);
      }
    }

    await updateProgress(15, 'matching', `Mencocokkan baris dengan data karyawan...`);

    let minDateMs = Infinity;
    let maxDateMs = -Infinity;

    // 2. GROUP RAW EXCEL DATA DYNAMICALLY
    for (const row of dataRows) {
      if (!row || row.length < 3) continue;
      const rawStatus = (row[colMap.status] || row[3] || '').toString().trim().toLowerCase();
      const rawId = (row[colMap.idNumber] || row[4] || '').toString().trim();
      const rawName = (row[colMap.name] || row[1] || '').toString().trim();
      
      let rawDateTime = row[colMap.dateTime] !== undefined ? row[colMap.dateTime] : row[2];
      if (rawDateTime === undefined || rawDateTime === null) continue;

      let eventTime;
      // Handle Excel Date Serial Number vs String
      if (typeof rawDateTime === 'number') {
        eventTime = new Date(Math.round((rawDateTime - 25569) * 86400 * 1000));
        // Normalize UTC back to Local Offset because Javascript serial parsing drops it
        eventTime = new Date(eventTime.getTime() + (eventTime.getTimezoneOffset() * 60000));
      } else {
        rawDateTime = rawDateTime.toString().trim();
        if (rawDateTime.includes('/')) {
           const parts = rawDateTime.split(' ');
           const dateParts = parts[0].split('/');
           const m = parseInt(dateParts[0]); 
           const d = parseInt(dateParts[1]); 
           const y = parseInt(dateParts[2]) < 100 ? parseInt(dateParts[2]) + 2000 : parseInt(dateParts[2]);
           
           let hours = 0, minutes = 0, seconds = 0;
           if (parts[1]) {
             const timeParts = parts[1].split(':');
             hours = parseInt(timeParts[0]);
             minutes = parseInt(timeParts[1]);
             seconds = parseInt(timeParts[2] || 0);
             const ampm = (parts[2] || '').toUpperCase();
             if (ampm === 'PM' && hours < 12) hours += 12;
             if (ampm === 'AM' && hours === 12) hours = 0;
           }
           eventTime = new Date(y, m - 1, d, hours, minutes, seconds);
        } else {
           eventTime = new Date(rawDateTime);
        }
      }

      if (isNaN(eventTime.getTime())) continue;

      // Track min/max for dynamic padding
      if (eventTime.getTime() < minDateMs) minDateMs = eventTime.getTime();
      if (eventTime.getTime() > maxDateMs) maxDateMs = eventTime.getTime();

      const y = eventTime.getFullYear();
      const m = eventTime.getMonth() + 1;
      const d = eventTime.getDate();
      const hours = eventTime.getHours();

      let emp = empByCode[rawId] || empByName[rawName.toLowerCase()];
      if (!emp) {
        const identifier = rawId ? `${rawName} (NIK: ${rawId})` : rawName;
        if (identifier.trim()) unmatchedNames.add(identifier);
        continue;
      }

      // CONSTRUCT DATE STRING (YYYY-MM-DD)
      const dateOnlyStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const groupKey = `${emp.id}|${dateOnlyStr}`;

      if (!grouped[groupKey]) {
        grouped[groupKey] = { employeeId: emp.id, employee: emp, date: dateOnlyStr, checkIn: null, checkOut: null };
      }

      // C4 FIX: Use shift midpoint instead of fragile hours < 12 heuristic
      const rosterShift = overrideMap.get(`${emp.id}_${dateOnlyStr}`);
      const effectiveShift = rosterShift || emp.shift || null;

      const empShiftStart = effectiveShift?.startTime || '08:00';
      let empShiftEnd = effectiveShift?.endTime || '17:00';
      
      const dayOfWeek = eventTime.getDay(); // 0 = Sunday, 6 = Saturday
      if (dayOfWeek === 6) {
        const satType = effectiveShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
        if (satType === 'HALF_DAY') {
          empShiftEnd = effectiveShift?.saturdayEndTime || satCheckoutTime;
        }
      }

      const [sH, sM] = empShiftStart.split(':').map(Number);
      const [eH, eM] = empShiftEnd.split(':').map(Number);
      const shiftStartMinutes = sH * 60 + sM;
      let shiftEndMinutes = eH * 60 + eM;
      
      if (shiftEndMinutes < shiftStartMinutes) {
        shiftEndMinutes += 24 * 60; // Handle night shift crossing midnight
      }
      
      const midpointMinutes = Math.floor((shiftStartMinutes + shiftEndMinutes) / 2);
      const scanHour = eventTime.getHours();
      const scanMinute = eventTime.getMinutes();
      let scanMinutes = scanHour * 60 + scanMinute;
      
      if (shiftEndMinutes > 1440 && scanMinutes < shiftStartMinutes - 6 * 60) {
        scanMinutes += 24 * 60; // night shift mornings scanMinutes adjust
      }

      if (rawStatus.includes('in') || (!rawStatus.includes('out') && scanMinutes <= midpointMinutes)) {
        if (!grouped[groupKey].checkIn || eventTime < grouped[groupKey].checkIn) grouped[groupKey].checkIn = eventTime;
      } else {
        if (!grouped[groupKey].checkOut || eventTime > grouped[groupKey].checkOut) grouped[groupKey].checkOut = eventTime;
      }
    }
    // 3. GENERATE FULL SEQUENCE (Dynamic Range from Min to Max) (C5 Optimization)
    if (minDateMs === Infinity || maxDateMs === -Infinity) {
      return res.status(400).json({ success: false, message: 'No valid attendance records found in the Excel file.' });
    }

    const minDate = new Date(minDateMs);
    const maxDate = new Date(maxDateMs);
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(23, 59, 59, 999);

    const employeesInvolved = [...new Set(Object.values(grouped).map(g => g.employeeId))];

    for (const empId of employeesInvolved) {
      const emp = allEmployees.find(e => e.id === empId);
      
      let current = new Date(minDate);
      current.setHours(12, 0, 0, 0); // prevent DST jumps
      const targetMax = new Date(maxDate);
      targetMax.setHours(12, 0, 0, 0);

      while (current <= targetMax) {
        const y = current.getFullYear();
        const m = current.getMonth() + 1;
        const day = current.getDate();
        
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const key = `${empId}|${dateStr}`;
        
        if (!grouped[key]) {
          grouped[key] = { employeeId: empId, employee: emp, date: dateStr, checkIn: null, checkOut: null };
        }
        current.setDate(current.getDate() + 1);
      }
    }

    // Pre-fetch all existing attendance records in the target date range to avoid N+1 queries
    const existingRecords = await prisma.attendance.findMany({
      where: {
        employeeId: { in: employeesInvolved },
        date: { gte: minDate, lte: maxDate }
      }
    });

    const existingMap = new Map();
    for (const rec of existingRecords) {
      const dateStr = rec.date.toISOString().split('T')[0];
      existingMap.set(`${rec.employeeId}_${dateStr}`, rec);
    }

    // 4. PREPARE ALL ENTRIES TO SAVE
    const totalEntries = Object.keys(grouped).length;
    let processedEntries = 0;
    await updateProgress(30, 'saving', `Menyimpan 0/${totalEntries} data ke database...`);

    const entriesToSave = [];

    for (const [key, entry] of Object.entries(grouped)) {
      try {
        const [y, m, d] = entry.date.split('-').map(Number);
        const dateObj = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)); 
        const dateStr = dateObj.toISOString().split('T')[0];

        const emp = entry.employee;
        const rosterShift = overrideMap.get(`${emp.id}_${entry.date}`);
        const effectiveShift = rosterShift || emp.shift || null;

        const shiftStart = effectiveShift?.startTime || '08:00';
        let shiftEnd = effectiveShift?.endTime || '17:00';
        const gracePeriod = effectiveShift ? effectiveShift.gracePeriod : globalGracePeriod;

        const recordDate = new Date(dateObj);
        const dayOfWeek = recordDate.getUTCDay();
        if (dayOfWeek === 6) {
          const satType = effectiveShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
          if (satType === 'HALF_DAY') {
            shiftEnd = effectiveShift?.saturdayEndTime || satCheckoutTime;
          }
        }

        let lateStatus = 'PRESENT';
        let lateMinutes = 0;
        if (entry.checkIn) {
          const calc = calculateLateness(entry.checkIn, shiftStart, gracePeriod, shiftEnd, roundingConfig);
          lateStatus = calc.status;
          lateMinutes = calc.lateMinutes;
        }

        const status = resolveStatus(entry.checkIn, entry.checkOut, lateStatus, dateObj, penaltyRules, shiftEnd, shiftStart);

        // H1 FIX / HRD protection: Skip records that were manually corrected by HRD
        const existingRecord = existingMap.get(`${entry.employeeId}_${dateStr}`);
        if (existingRecord) {
          const isManual = existingRecord.mode === 'Manual' || 
                           existingRecord.mode === 'Manual (SPL)' || 
                           existingRecord.mode === 'Manual (BHL)' || 
                           existingRecord.notes?.includes('HRD');
          if (isManual) {
            processedEntries++;
            continue; // Protect manual HRD corrections
          }
        }

        entriesToSave.push({
          employeeId: entry.employeeId,
          dateObj,
          checkIn: entry.checkIn || null,
          checkOut: entry.checkOut || null,
          status,
          lateMinutes,
          mode: 'Fingerprint',
          hasExisting: !!existingRecord,
          existingId: existingRecord?.id,
          key
        });
      } catch (err) {
        errors.push(`${key}: ${err.message}`);
        processedEntries++;
      }
    }

    // 5. UPSERT ALL RECORDS IN CHUNKS
    const chunkSize = 200;
    for (let i = 0; i < entriesToSave.length; i += chunkSize) {
      const chunk = entriesToSave.slice(i, i + chunkSize);
      
      try {
        await prisma.$transaction(async (tx) => {
          for (const item of chunk) {
            if (item.hasExisting) {
              await tx.attendance.update({
                where: { id: item.existingId },
                data: {
                  checkIn: item.checkIn,
                  checkOut: item.checkOut,
                  status: item.status,
                  lateMinutes: item.lateMinutes,
                  mode: item.mode
                }
              });
            } else {
              await tx.attendance.create({
                data: {
                  employeeId: item.employeeId,
                  date: item.dateObj,
                  checkIn: item.checkIn,
                  checkOut: item.checkOut,
                  status: item.status,
                  lateMinutes: item.lateMinutes,
                  mode: item.mode
                }
              });
            }
            imported++;
            processedEntries++;
          }
        });

        const pct = Math.round(30 + (processedEntries / totalEntries) * 65);
        await updateProgress(pct, 'saving', `Menyimpan ${processedEntries}/${totalEntries} data ke database...`);
      } catch (err) {
        // Log transaction error and track them
        chunk.forEach(item => {
          errors.push(`${item.key}: Transaction chunk failed: ${err.message}`);
          processedEntries++;
        });
      }
    }

    await updateProgress(98, 'finalizing', 'Menyelesaikan import...');

    const unmatchedList = Array.from(unmatchedNames);
    const unmatchedCount = unmatchedList.length;

    await updateProgress(100, 'done', 'Import selesai!');

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

    // Clean up progress after 30s from DB (C3 Fix)
    setTimeout(async () => { 
      try {
        await deleteImportProgress(jobId); 
      } catch (e) {
        console.error(`[Import] Failed to cleanup job progress: ${e.message}`);
      }
    }, 30000);
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
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const settingsList = await prisma.settings.findMany();
    const { penaltyRules, roundingConfig } = parsePenaltySettings(settingsList);
    const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
    const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
    const globalGracePeriod = parseInt(settingsList.find(s => s.key === 'gracePeriod')?.value || '15', 10);

    const overrides = await prisma.employeeShiftOverride.findMany({
      where: {
        startDate: { lte: end },
        endDate: { gte: start }
      },
      include: { shift: true }
    });

    const overrideMap = new Map();
    for (const ov of overrides) {
      let d = new Date(ov.startDate);
      const endD = new Date(ov.endDate);
      while (d <= endD) {
        const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        overrideMap.set(`${ov.employeeId}_${dStr}`, ov.shift);
        d.setDate(d.getDate() + 1);
      }
    }

    const records = await prisma.attendance.findMany({
      where: { date: { gte: start, lte: end }, checkIn: { not: null } },
      include: { employee: { include: { shift: true } } },
    });

    let updatedCount = 0;
    for (const record of records) {
      const dateStr = record.date.toISOString().split('T')[0];
      const rosterShift = overrideMap.get(`${record.employeeId}_${dateStr}`);
      const effectiveShift = rosterShift || record.employee.shift || null;

      const shiftStart = effectiveShift?.startTime || '08:00';
      let shiftEnd = effectiveShift?.endTime || '17:00';
      const gracePeriod = effectiveShift ? effectiveShift.gracePeriod : globalGracePeriod;

      const recordDate = new Date(record.date);
      const dayOfWeek = recordDate.getUTCDay();
      if (dayOfWeek === 6) {
        const satType = effectiveShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
        if (satType === 'HALF_DAY') {
          shiftEnd = effectiveShift?.saturdayEndTime || satCheckoutTime;
        }
      }

      let lateStatus = 'PRESENT';
      let lateMinutes = 0;
      if (record.checkIn) {
        const calc = calculateLateness(record.checkIn, shiftStart, gracePeriod, shiftEnd, roundingConfig);
        lateStatus = calc.status;
        lateMinutes = calc.lateMinutes;
      }
      
      const finalStatus = resolveStatus(record.checkIn, record.checkOut, lateStatus, record.date, penaltyRules, shiftEnd, shiftStart);
      
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

    const settingsList = await prisma.settings.findMany();
    const { penaltyRules, roundingConfig } = parsePenaltySettings(settingsList);
    const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
    const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
    const globalGracePeriod = parseInt(settingsList.find(s => s.key === 'gracePeriod')?.value || '15', 10);

    const overrides = await prisma.employeeShiftOverride.findMany({
      where: {
        startDate: { lte: tEnd },
        endDate: { gte: tStart }
      },
      include: { shift: true }
    });

    const overrideMap = new Map();
    for (const ov of overrides) {
      overrideMap.set(ov.employeeId, ov.shift);
    }

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

        const rosterShift = overrideMap.get(src.employeeId);
        const effectiveShift = rosterShift || src.employee.shift || null;

        const shiftStart = effectiveShift?.startTime || '08:00';
        let shiftEnd = effectiveShift?.endTime || '17:00';
        const gracePeriod = effectiveShift ? effectiveShift.gracePeriod : globalGracePeriod;

        const dayOfWeek = tStart.getUTCDay();
        if (dayOfWeek === 6) {
          const satType = effectiveShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
          if (satType === 'HALF_DAY') {
            shiftEnd = effectiveShift?.saturdayEndTime || satCheckoutTime;
          }
        }

        let lateStatus = 'PRESENT';
        let lateMinutes = 0;
        if (newCheckIn) {
          const calc = calculateLateness(newCheckIn, shiftStart, gracePeriod, shiftEnd, roundingConfig);
          lateStatus = calc.status;
          lateMinutes = calc.lateMinutes;
        }

        const newStatus = resolveStatus(newCheckIn, newCheckOut, lateStatus, tStart, penaltyRules, shiftEnd, shiftStart);

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
      const today = getUTCToday();
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      where.date = { gte: today, lt: tomorrow };
    } else if (period === 'This Week') {
      const startOfWeek = getUTCStartOfWeek(now);
      where.date = { gte: startOfWeek, lte: toUTCMidnight(now) };
    } else if (period === 'This Month') {
      const startOfMonth = getUTCStartOfMonth(now);
      where.date = { gte: startOfMonth, lte: toUTCMidnight(now) };
    } else if (period === 'Custom' && startDate && endDate) {
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

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
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
    const { status, notes, overtimeHours, checkInTime, checkOutTime, lateMinutes, attachment, employeeCode, date } = req.body;
    
    const validStatuses = ['PRESENT', 'LATE', 'ABSENT', 'MANGKIR', 'SAKIT', 'IZIN', 'CUTI', 'HOLIDAY'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    let oldRecord;
    const isPadded = id.startsWith('pad-') || isNaN(parseInt(id));

    if (isPadded) {
      if (!employeeCode || !date) {
        return res.status(400).json({ success: false, message: 'Employee code and date are required for padded records' });
      }
      const employee = await prisma.employee.findUnique({
        where: { employeeCode },
        include: { shift: true }
      });
      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }

      const targetDate = toUTCMidnight(new Date(date));
      oldRecord = {
        id: null,
        date: targetDate,
        status: 'ABSENT',
        checkIn: null,
        checkOut: null,
        lateMinutes: 0,
        overtimeHours: 0,
        employee
      };
    } else {
      oldRecord = await prisma.attendance.findUnique({
        where: { id: parseInt(id) },
        include: { employee: { include: { shift: true } } }
      });
      if (!oldRecord) {
         return res.status(404).json({ success: false, message: 'Record not found' });
      }
    }

    // Fetch global settings and overrides for recalculation
    const settingsList = await prisma.settings.findMany();
    const { penaltyRules: updatePenaltyRules, roundingConfig: updateRoundingConfig } = parsePenaltySettings(settingsList);
    const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
    const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
    const globalGracePeriod = parseInt(settingsList.find(s => s.key === 'gracePeriod')?.value || '15', 10);
    const timezoneOffset = parseInt(settingsList.find(s => s.key === 'timezoneOffset')?.value || '420', 10);

    const dateStart = new Date(oldRecord.date);
    dateStart.setHours(0,0,0,0);
    const dateEnd = new Date(oldRecord.date);
    dateEnd.setHours(23,59,59,999);
    
    const override = await prisma.employeeShiftOverride.findFirst({
      where: {
        employeeId: oldRecord.employee.id,
        startDate: { lte: dateEnd },
        endDate: { gte: dateStart }
      },
      include: { shift: true }
    });
    const effectiveShift = override?.shift || oldRecord.employee?.shift || null;
    
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

    const baseDate = new Date(oldRecord.date);

    // Manual Time Update Parsing (Timezone-agnostic conversion from local time to UTC)
    if (checkInTime !== undefined) {
      if (!checkInTime) {
        updateData.checkIn = null;
      } else {
        const [h, m] = checkInTime.split(':').map(Number);
        updateData.checkIn = new Date(baseDate.getTime() + (h * 60 + m - timezoneOffset) * 60000);
      }
    }
    
    if (checkOutTime !== undefined) {
      if (!checkOutTime) {
        updateData.checkOut = null;
      } else {
        const [h, m] = checkOutTime.split(':').map(Number);
        updateData.checkOut = new Date(baseDate.getTime() + (h * 60 + m - timezoneOffset) * 60000);
      }
    }

    // Automatically recalculate status and lateness if times are changed and status is not explicitly set to SAKIT/IZIN/etc.
    const finalStatusType = status || oldRecord.status;
    if (!['SAKIT', 'IZIN', 'CUTI', 'HOLIDAY'].includes(finalStatusType)) {
      const shiftStart = effectiveShift?.startTime || '08:00';
      let shiftEnd = effectiveShift?.endTime || '17:00';
      const gracePeriod = effectiveShift ? effectiveShift.gracePeriod : globalGracePeriod;
      
      const recordDate = new Date(oldRecord.date);
      const dayOfWeek = recordDate.getUTCDay();
      if (dayOfWeek === 6) {
        const satType = effectiveShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
        if (satType === 'HALF_DAY') {
          shiftEnd = effectiveShift?.saturdayEndTime || satCheckoutTime;
        }
      }

      const finalIn = 'checkIn' in updateData ? updateData.checkIn : oldRecord.checkIn;
      const finalOut = 'checkOut' in updateData ? updateData.checkOut : oldRecord.checkOut;
      
      let lateStatus = 'PRESENT';
      let lateMins = 0;
      if (finalIn) {
        const calc = calculateLateness(finalIn, shiftStart, gracePeriod, shiftEnd, updateRoundingConfig);
        lateStatus = calc.status;
        lateMins = calc.lateMinutes;
      }
      
      updateData.lateMinutes = lateMins;
      updateData.status = resolveStatus(finalIn, finalOut, lateStatus, oldRecord.date, updatePenaltyRules, shiftEnd, shiftStart);
    }

    let record;
    if (isPadded) {
      record = await prisma.attendance.create({
        data: {
          employeeId: oldRecord.employee.id,
          date: oldRecord.date,
          status: updateData.status || 'ABSENT',
          notes: updateData.notes || null,
          overtimeHours: updateData.overtimeHours || 0,
          lateMinutes: updateData.lateMinutes || 0,
          checkIn: updateData.checkIn || null,
          checkOut: updateData.checkOut || null,
          photoUrl: updateData.photoUrl || null,
          mode: 'Manual'
        }
      });
    } else {
      record = await prisma.attendance.update({
        where: { id: oldRecord.id },
        data: updateData
      });
    }

    // Record detailed audit
    if (req.user) {
      try {
         await recordAuditLog({
           userId: req.user.id,
           username: req.user.username,
           role: req.user.role,
           action: 'CORRECTION',
           entity: 'Attendance',
           entityId: record.id,
           details: JSON.stringify({ 
             employee: oldRecord?.employee?.name, 
             oldStatus: oldRecord?.status, 
             newStatus: record.status, 
             lateFixed: record.lateMinutes,
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
    
    // Process within a database transaction for atomicity and integrity
    await prisma.$transaction(async (tx) => {
      for (const rec of records) {
        if (!rec.employeeId || isNaN(rec.employeeId)) continue;
        if (rec.overtimeHours === undefined || rec.overtimeHours === null || rec.overtimeHours === '') continue;
        
        const attendance = await tx.attendance.upsert({
          where: { employeeId_date: { employeeId: parseInt(rec.employeeId), date: dateObj } },
          update: { 
            overtimeHours: parseFloat(rec.overtimeHours),
            ...(rec.reason ? { notes: rec.reason } : {})
          },
          create: {
            employeeId: parseInt(rec.employeeId),
            date: dateObj,
            status: 'ABSENT', // they might not have clocked in, but admin gave them overtime?
            overtimeHours: parseFloat(rec.overtimeHours),
            mode: 'Manual (SPL)',
            notes: rec.reason || null
          },
          include: { employee: true }
        });
        updatedCount++;

        // Record detailed audit
        if (req.user) {
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
    });

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
    
    // Process within a database transaction for atomicity and integrity
    await prisma.$transaction(async (tx) => {
      for (const rec of records) {
        if (rec.status === 'DELETE') {
          await tx.attendance.deleteMany({
            where: { employeeId: rec.employeeId, date: dateObj }
          });
          updatedCount++;
          
          // Record detailed audit
          if (req.user) {
            try {
               await recordAuditLog({
                 userId: req.user.id,
                 username: req.user.username,
                 role: req.user.role,
                 action: 'DELETE_BHL',
                 entity: 'Attendance',
                 details: JSON.stringify({ 
                   logMsg: `Absen Harian (BHL) dihapus untuk Employee ID: ${rec.employeeId} (Tgl: ${date})`
                 }),
                 ipAddress: req.ip,
               });
            } catch(e) { }
          }
          continue;
        }

        if (!rec.status || !VALID_STATUSES.includes(rec.status)) continue;
        
        const attendance = await tx.attendance.upsert({
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
    });

    res.json({ success: true, message: `Berhasil memproses absen Harian/BHL untuk ${updatedCount} karyawan.`, updatedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/attendance/manual-correction
 */
const manualCorrectionHRD = async (req, res) => {
  try {
    const { type, date, records } = req.body;
    if (!type || !date || !records || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const targetDate = toUTCMidnight(new Date(date));
    
    // Fetch timezoneOffset setting
    const timezoneOffsetSetting = await prisma.settings.findUnique({
      where: { key: 'timezoneOffset' }
    });
    const timezoneOffset = parseInt(timezoneOffsetSetting?.value || '420', 10);
    
    let updatedCount = 0;

    // Use $transaction for atomicity and data consistency
    await prisma.$transaction(async (tx) => {
      for (const record of records) {
        const { employeeId, status, checkIn, checkOut, photo } = record;
        
        const emp = await tx.employee.findUnique({ 
          where: { id: employeeId },
          include: { shift: true }
        });
        if (!emp) continue;

        let photoUrl = undefined;
        
        if (photo && photo.startsWith('data:image')) {
          const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
          const extMatch = photo.split(';')[0].match(/jpeg|png|gif|webp/);
          const ext = extMatch ? extMatch[0] : 'jpg';
          const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'corrections');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          const filename = `correction_${emp.employeeCode}_${Date.now()}.${ext}`;
          const filepath = path.join(uploadDir, filename);
          fs.writeFileSync(filepath, base64Data, 'base64');
          photoUrl = `/uploads/corrections/${filename}`;
        }

        const existing = await tx.attendance.findUnique({
          where: { employeeId_date: { employeeId, date: targetDate } }
        });

        if (type === 'KEHADIRAN') {
          const payload = {
            status: status,
            checkIn: null,
            checkOut: null,
            notes: 'Diupdate manual oleh HRD'
          };
          
          let attendanceRecord;
          if (existing) {
            attendanceRecord = await tx.attendance.update({ where: { id: existing.id }, data: payload });
          } else {
            attendanceRecord = await tx.attendance.create({ data: { employeeId, date: targetDate, ...payload } });
          }
          updatedCount++;
          
          try {
             await recordAuditLog({
               userId: req.user.id,
               username: req.user.username,
               role: req.user.role,
               action: 'MANUAL_CORRECTION_STATUS',
               entity: 'Attendance',
               entityId: attendanceRecord.id || existing?.id || null,
               details: JSON.stringify({ 
                 emp: emp.name, 
                 employeeCode: emp.employeeCode, 
                 date, 
                 status, 
                 previousStatus: existing?.status || 'BELUM ABSEN' 
               }),
               ipAddress: req.ip
             });
          } catch(e) {}
        } else if (type === 'LUPA_FINGER') {
          let finalIn = existing?.checkIn;
          let finalOut = existing?.checkOut;
          
          if (checkIn) {
            const [h, m] = checkIn.split(':').map(Number);
            finalIn = new Date(targetDate.getTime() + (h * 60 + m - timezoneOffset) * 60000);
          }
          if (checkOut) {
            const [h, m] = checkOut.split(':').map(Number);
            finalOut = new Date(targetDate.getTime() + (h * 60 + m - timezoneOffset) * 60000);
          }

          // Security & Logic Fix: Query shift override using correct schema fields (startDate and endDate)
          const shiftOverride = await tx.employeeShiftOverride.findFirst({
            where: {
              employeeId,
              startDate: { lte: targetDate },
              endDate: { gte: targetDate }
            },
            include: { shift: true }
          });

          const effectiveShift = shiftOverride?.shift || emp.shift;
          const cInStr = effectiveShift?.startTime || "08:00"; 
          const gracePeriod = effectiveShift?.gracePeriod || 15;
          
          const [sh, sm] = cInStr.split(':').map(Number);
          const expectedIn = new Date(targetDate.getTime() + (sh * 60 + sm - timezoneOffset) * 60000);

          let lateMins = 0;
          let pStatus = 'ABSENT';
          if (finalIn) {
             const diff = Math.floor((finalIn - expectedIn) / 60000);
             if (diff > 0) lateMins = diff;
             pStatus = lateMins > 0 ? 'LATE' : 'PRESENT';
          }

          const finalStatus = resolveStatus(finalIn, finalOut, pStatus, targetDate);

          const payload = {
            checkIn: finalIn,
            checkOut: finalOut,
            status: finalStatus,
            lateMinutes: lateMins,
            notes: 'Lupa Finger dikoreksi HRD',
          };
          
          if (photoUrl) {
            payload.photoUrl = photoUrl;
          }

          let attendanceRecord;
          if (existing) {
            attendanceRecord = await tx.attendance.update({ where: { id: existing.id }, data: payload });
          } else {
            attendanceRecord = await tx.attendance.create({ data: { employeeId, date: targetDate, ...payload } });
          }
          updatedCount++;

          try {
             const formatTime24 = (dateObj) => {
               if (!dateObj) return '--:--';
               const d = new Date(dateObj);
               return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' });
             };
             await recordAuditLog({
               userId: req.user.id,
               username: req.user.username,
               role: req.user.role,
               action: 'MANUAL_CORRECTION_TIME',
               entity: 'Attendance',
               entityId: attendanceRecord.id || existing?.id || null,
               details: JSON.stringify({ 
                 emp: emp.name, 
                 employeeCode: emp.employeeCode, 
                 date, 
                 checkIn, 
                 checkOut,
                 previousCheckIn: existing?.checkIn ? formatTime24(existing.checkIn) : '--:--',
                 previousCheckOut: existing?.checkOut ? formatTime24(existing.checkOut) : '--:--',
                 photoUrl: photoUrl || existing?.photoUrl || null
               }),
               ipAddress: req.ip
             });
          } catch(e) {}
        }
      }
    });

    res.json({ success: true, message: `Berhasil memproses koreksi untuk ${updatedCount} karyawan.`, updatedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/attendance/overtime-summary?month=2026-05
const getOvertimeSummary = async (req, res) => {
  try {
    const { month } = req.query; // format: YYYY-MM
    if (!month) return res.status(400).json({ success: false, message: 'Month parameter required (YYYY-MM)' });
    
    const [year, m] = month.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, m - 1, 1));
    const endDate = new Date(Date.UTC(year, m, 0, 23, 59, 59));
    
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        overtimeHours: { gt: 0 }
      },
      include: {
        employee: {
          include: { department: true, salary: true }
        }
      }
    });

    const summaryMap = new Map();
    let totalEmployees = 0;
    let totalHours = 0;
    let estimatedCost = 0;

    // We can assume a basic rate or get it from config if needed. For now, we just sum hours
    // and provide a dummy estimated cost if baseSalary is not reliable, or use a basic formula:
    // Rate = baseSalary / 173
    for (const record of attendanceRecords) {
      const emp = record.employee;
      if (!emp) continue;

      if (!summaryMap.has(emp.id)) {
        summaryMap.set(emp.id, {
          employeeId: emp.id,
          employeeCode: emp.employeeCode,
          name: emp.name,
          department: emp.department?.name || '-',
          section: emp.section || '-',
          position: emp.position || '-',
          totalOvertimeHours: 0,
          totalCost: 0,
          records: []
        });
        totalEmployees++;
      }

      const empSummary = summaryMap.get(emp.id);
      empSummary.totalOvertimeHours += record.overtimeHours;
      empSummary.records.push({
        date: record.date.toISOString().split('T')[0],
        hours: record.overtimeHours,
        notes: record.notes || ''
      });

      // Simple estimation: baseSalary / 173 * hours
      const baseSalary = emp.salary?.baseSalary || 0;
      const hourlyRate = baseSalary > 0 ? baseSalary / 173 : 0;
      const cost = record.overtimeHours * hourlyRate * 1.5; // assume 1.5x on average for estimation
      
      empSummary.totalCost += cost;
      
      totalHours += record.overtimeHours;
      estimatedCost += cost;
    }

    res.json({
      success: true,
      data: Array.from(summaryMap.values()),
      totals: {
        totalEmployees,
        totalHours,
        estimatedCost
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/attendance/bhl-summary?month=2026-05
const getBhlSummary = async (req, res) => {
  try {
    const { month } = req.query; // format: YYYY-MM
    if (!month) return res.status(400).json({ success: false, message: 'Month parameter required (YYYY-MM)' });
    
    const [year, m] = month.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, m - 1, 1));
    const endDate = new Date(Date.UTC(year, m, 0, 23, 59, 59));
    
    // Get all BHL employees
    const bhlEmployees = await prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { employmentStatus: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } },
          { salary: { employmentType: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } } }
        ]
      },
      include: {
        salary: true,
        department: true,
        attendance: {
          where: { date: { gte: startDate, lte: endDate } }
        }
      }
    });
    
    const summary = bhlEmployees.map(emp => {
      const dailyRate = emp.salary?.dailyRate || 0;
      const workingDays = emp.attendance.filter(a => ['PRESENT', 'LATE'].includes(a.status)).length;
      const halfDays = emp.attendance.filter(a => a.status === 'HALF_DAY').length;
      const sickDays = emp.attendance.filter(a => a.status === 'SAKIT').length;
      const leaveDays = emp.attendance.filter(a => a.status === 'IZIN').length;
      const absentDays = emp.attendance.filter(a => ['ABSENT', 'MANGKIR'].includes(a.status)).length;
      const effectiveDays = workingDays + (halfDays * 0.5);
      const totalWage = effectiveDays * dailyRate;
      
      return {
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        name: emp.name,
        department: emp.department?.name || '-',
        section: emp.section || '-',
        dailyRate,
        workingDays,
        halfDays,
        sickDays,
        leaveDays,
        absentDays,
        effectiveDays,
        totalWage,
        attendanceDetails: emp.attendance.map(a => {
          const dStr = a.date.toISOString().split('T')[0];
          return {
            date: dStr,
            status: a.status
          };
        })
      };
    });
    
    res.json({
      success: true,
      data: summary,
      totals: {
        totalEmployees: summary.length,
        totalWorkingDays: summary.reduce((s, e) => s + e.workingDays, 0),
        totalWage: summary.reduce((s, e) => s + e.totalWage, 0)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getCorrectionHistory = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ success: false, message: 'Month parameter required (YYYY-MM)' });
    
    const [year, m] = month.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

    const logs = await prisma.auditLog.findMany({
      where: {
        action: { in: ['MANUAL_CORRECTION_STATUS', 'MANUAL_CORRECTION_TIME', 'CORRECTION'] },
        createdAt: { gte: startDate, lte: endDate }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: logs });
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
  bulkUpdateDailyWorkers,
  manualCorrectionHRD,
  getOvertimeSummary,
  getBhlSummary,
  getCorrectionHistory
};
