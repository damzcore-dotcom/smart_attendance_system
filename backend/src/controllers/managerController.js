const prisma = require('../prismaClient');
const { resolveStatus } = require('../utils/lateCalculator');

/**
 * GET /api/manager/dashboard
 */
const getDashboard = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const access = await prisma.$queryRaw`SELECT * FROM "ManagerAccess" WHERE "userId" = ${user.id}`;
    const ma = access[0];

    const isAllDepts = ma?.manageAllDepts || false;
    const deptId = ma?.managedDeptId;
    
    if (!isAllDepts && deptId === null && user.role === 'MANAGER') {
      return res.status(400).json({ success: false, message: 'Account not assigned to any department.' });
    }

    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const empWhere = { status: 'ACTIVE' };
    if (!isAllDepts) empWhere.departmentId = deptId;

    const employees = await prisma.employee.findMany({ where: empWhere });
    const employeeIds = employees.map(e => e.id);

    const attendance = await prisma.attendance.findMany({
      where: { employeeId: { in: employeeIds }, date: { gte: startOfDay, lte: endOfDay } },
      include: { employee: true }
    });

    const totalEmployees = employeeIds.length;
    const present = attendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE');
    const late = attendance.filter(a => a.status === 'LATE');
    const onLeave = await prisma.leaveRequest.count({
      where: { employeeId: { in: employeeIds }, status: 'APPROVED', startDate: { lte: endOfDay }, endDate: { gte: startOfDay } }
    });
    const absent = totalEmployees - present.length - onLeave;

    const summary = {
      totalEmployees,
      present: present.length,
      late: late.length,
      leave: onLeave,
      absent: absent
    };

    const stats = {
      totalTeam: summary.totalEmployees,
      present: summary.present,
      late: summary.late,
      leave: summary.leave,
      absent: summary.absent,
      attendanceRate: summary.totalEmployees > 0 
        ? Math.round((summary.present / summary.totalEmployees) * 100) 
        : 0
    };

    res.json({
      success: true,
      data: {
        stats: { 
          totalEmployees: summary.totalEmployees, 
          present: summary.present, 
          late: summary.late, 
          onLeave: summary.leave, 
          absent: summary.absent 
        },
        lateEmployees: late.map(a => ({ name: a.employee.name, employeeCode: a.employee.employeeCode, checkIn: a.checkIn, lateMinutes: a.lateMinutes }))
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/**
 * GET /api/manager/attendance-options
 * New: To support filters in Manager portal
 */
const getAttendanceOptions = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const access = await prisma.$queryRaw`SELECT * FROM "ManagerAccess" WHERE "userId" = ${user.id}`;
    const ma = access[0];
    const isAllDepts = ma?.manageAllDepts || false;
    const deptId = ma?.managedDeptId;

    // Filter departments based on access
    let departments;
    if (isAllDepts) {
      departments = await prisma.department.findMany({ orderBy: { name: 'asc' } });
    } else {
      departments = await prisma.department.findMany({ where: { id: deptId } });
    }

    const sections = [...new Set((await prisma.employee.findMany({ where: isAllDepts ? {} : { departmentId: deptId }, select: { section: true } })).map(e => e.section).filter(Boolean))];
    const positions = [...new Set((await prisma.employee.findMany({ where: isAllDepts ? {} : { departmentId: deptId }, select: { position: true } })).map(e => e.position).filter(Boolean))];

    const statuses = ['PRESENT', 'LATE', 'MANGKIR', 'HOLIDAY', 'CUTI', 'SAKIT', 'IZIN', 'ABSENT'];

    res.json({ success: true, data: { departments, sections, positions, statuses } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/**
 * GET /api/manager/attendance
 * Updated: Support full filtering and pagination like Director portal
 */
const getAttendance = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const access = await prisma.$queryRaw`SELECT * FROM "ManagerAccess" WHERE "userId" = ${user.id}`;
    const ma = access[0];
    const isAllDepts = ma?.manageAllDepts || false;
    const managedDeptId = ma?.managedDeptId;

    const { period, startDate, endDate, dept, section, position, status, search, page = 1, limit = 50, sortBy, order } = req.query;

    const dateRange = {};
    const now = new Date();
    if (period === 'today') {
      const today = new Date(now.setHours(0, 0, 0, 0));
      const end = new Date(now.setHours(23, 59, 59, 999));
      dateRange.gte = today; dateRange.lte = end;
    } else if (period === 'week') {
      const start = new Date(now.setDate(now.getDate() - now.getDay()));
      dateRange.gte = start; dateRange.lte = new Date();
    } else if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      dateRange.gte = start; dateRange.lte = new Date();
    } else if (period === 'custom' && startDate && endDate) {
      dateRange.gte = new Date(startDate);
      dateRange.lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const where = { date: dateRange };
    const empWhere = {};
    if (!isAllDepts) empWhere.departmentId = managedDeptId;
    if (dept && dept !== 'All') empWhere.department = { name: dept };
    if (section && section !== 'All') empWhere.section = section;
    if (position && position !== 'All') empWhere.position = position;
    if (search) empWhere.name = { contains: search, mode: 'insensitive' };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Logic for Mangkir (Absent) - Find employees with no attendance record
    if (status === 'Mangkir' || status === 'Absent') {
      const allEmployees = await prisma.employee.findMany({
        where: empWhere,
        include: { department: true }
      });

      const attendedIds = (await prisma.attendance.findMany({
        where: { date: dateRange, employee: empWhere },
        select: { employeeId: true }
      })).map(a => a.employeeId);

      const mangkirList = allEmployees.filter(e => !attendedIds.includes(e.id));
      const total = mangkirList.length;

      // Sort mangkir list if needed (frontend sort since it's an array)
      if (sortBy === 'name') {
        mangkirList.sort((a, b) => order === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
      }

      const paginated = mangkirList.slice(skip, skip + parseInt(limit));

      const finalData = paginated.map(e => ({
        id: `mangkir-${e.id}`,
        date: dateRange.gte || new Date(),
        nik: e.employeeCode,
        name: e.name,
        dept: e.department?.name,
        section: e.section,
        position: e.position,
        checkIn: '-',
        checkOut: '-',
        status: 'Mangkir',
        lateMinutes: 0
      }));

      return res.json({ success: true, data: finalData, total, totalPages: Math.ceil(total / limit) });
    }

    where.employee = empWhere;
    if (status) where.status = status;

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

    const { resolveStatus } = require('../utils/lateCalculator');

    // Fetch Global Settings (Working Days)
    const settingsList = await prisma.settings.findMany();
    const workingDaysSetting = settingsList.find(s => s.key === 'workingDays')?.value || '[1,2,3,4,5]';
    const workingDays = JSON.parse(workingDaysSetting);

    const [records, total, allRecords] = await Promise.all([
      prisma.attendance.findMany({
        where,
        include: { employee: { include: { department: true } } },
        orderBy,
        skip,
        take: parseInt(limit)
      }),
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({ 
        where,
        select: { status: true, lateMinutes: true, checkIn: true, checkOut: true, date: true, employeeId: true }
      })
    ]);

    let summary = { hadir: 0, telat: 0, mangkir: 0, absen: 0, holiday: 0, cuti: 0, sakit: 0, izin: 0, totalLate: 0, uniqueEmployeeCount: 0 };
    const uniqueEmployees = new Set();
    allRecords.forEach(r => {
      uniqueEmployees.add(r.employeeId);
      const recordDay = new Date(r.date).getDay();
      const isWorkingDay = workingDays.includes(recordDay);
      let finalStatus = r.status;
      
      if (!isWorkingDay && !r.checkIn && !r.checkOut && r.status === 'ABSENT') {
        finalStatus = 'HOLIDAY';
      }

      const resolved = resolveStatus(r.checkIn, r.checkOut, finalStatus, r.date);
      if (resolved === 'PRESENT') summary.hadir++;
      else if (resolved === 'LATE') summary.telat++;
      else if (resolved === 'MANGKIR') summary.mangkir++;
      else if (resolved === 'HOLIDAY') summary.holiday++;
      else if (resolved === 'CUTI') summary.cuti++;
      else if (resolved === 'SAKIT') summary.sakit++;
      else if (resolved === 'IZIN') summary.izin++;
      else summary.absen++;

      const penalty = (resolved === 'MANGKIR') ? 30 : 0;
      summary.totalLate += (r.lateMinutes || 0) + penalty;
    });
    summary.uniqueEmployeeCount = uniqueEmployees.size;

    res.json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary,
      data: records.map(att => {
        const resolved = resolveStatus(att.checkIn, att.checkOut, att.status, att.date);
        
        let displayStatus = 'Tanpa Keterangan (Alpa)';
        if (resolved === 'PRESENT') displayStatus = 'Hadir';
        else if (resolved === 'LATE') displayStatus = 'Terlambat';
        else if (resolved === 'MANGKIR') displayStatus = 'Mangkir';
        else if (resolved === 'HOLIDAY') displayStatus = 'Libur';
        else if (resolved === 'CUTI') displayStatus = 'Cuti';
        else if (resolved === 'SAKIT') displayStatus = 'Sakit';
        else if (resolved === 'IZIN') displayStatus = 'Izin';

        return {
          id: att.id,
          name: att.employee.name,
          employeeCode: att.employee.employeeCode,
          dept: att.employee.department?.name,
          section: att.employee.section,
          position: att.employee.position,
          date: att.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }),
          checkIn: att.checkIn ? att.checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-- : --',
          checkOut: att.checkOut ? att.checkOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-- : --',
          status: displayStatus,
          lateMinutes: att.lateMinutes,
          mode: att.mode,
        };
      }),
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/**
 * GET /api/manager/leave-requests
 */
const getLeaveRequests = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const access = await prisma.$queryRaw`SELECT * FROM "ManagerAccess" WHERE "userId" = ${user.id}`;
    const ma = access[0];
    const isAllDepts = ma?.manageAllDepts || false;
    const deptId = ma?.managedDeptId;
    
    const leaveWhere = {};
    if (!isAllDepts) leaveWhere.employee = { departmentId: deptId };

    const requests = await prisma.leaveRequest.findMany({
      where: leaveWhere,
      include: { employee: { include: { department: true } } },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: requests.map(r => ({ 
        id: r.id, 
        nik: r.employee.employeeCode, 
        name: r.employee.name, 
        department: r.employee.department.name, 
        section: r.employee.section || '-',
        type: r.type, 
        startDate: r.startDate, 
        endDate: r.endDate, 
        reason: r.reason, 
        status: r.status,
        medicalAttachment: r.medicalAttachment
      }))
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const updateLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const request = await prisma.leaveRequest.update({
      where: { id: parseInt(id) },
      data: { status, adminNotes, processedBy: req.user.username, processedAt: new Date() }
    });
    res.json({ success: true, message: 'Leave request updated successfully', data: request });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getDashboard, getAttendanceOptions, getAttendance, getLeaveRequests, updateLeaveRequest };
