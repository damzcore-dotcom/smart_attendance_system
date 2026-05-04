const prisma = require('../prismaClient');
const { calculateLateness } = require('../utils/lateCalculator');

/**
 * GET /api/attendance
 */
const getAll = async (req, res) => {
  try {
    const { search, dept, date, period } = req.query;

    const where = {};

    // Date filtering
    const now = new Date();
    if (period === 'Today' || (!period && !date)) {
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
    } else if (date) {
      const d = new Date(date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.date = { gte: d, lt: next };
    }

    // Department filter
    if (dept && dept !== 'All') {
      where.employee = { department: { name: dept } };
    }

    // Search
    if (search) {
      where.employee = {
        ...where.employee,
        name: { contains: search, mode: 'insensitive' },
      };
    }

    const records = await prisma.attendance.findMany({
      where,
      include: { employee: { include: { department: true } } },
      orderBy: { date: 'desc' },
    });

    res.json({
      success: true,
      data: records.map(r => ({
        id: r.id,
        name: r.employee.name,
        dept: r.employee.department.name,
        date: r.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        checkIn: r.checkIn ? r.checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-- : --',
        checkOut: r.checkOut ? r.checkOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-- : --',
        status: r.status === 'PRESENT' ? 'Present' : r.status === 'LATE' ? 'Late' : 'Absent',
        lateMinutes: r.lateMinutes,
        mode: r.mode,
      })),
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
    const { employeeId, mode = 'Credentials' } = req.body;

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { shift: true },
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
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
    const { lateMinutes, status } = calculateLateness(now, shiftStart, gracePeriod);

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
    });

    if (!attendance || !attendance.checkIn) {
      return res.status(400).json({ success: false, message: 'No check-in record found for today' });
    }

    if (attendance.checkOut) {
      return res.status(400).json({ success: false, message: 'Already checked out today' });
    }

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { checkOut: now },
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
    const absent = totalEmployees - present - late;
    const avgLateMinutes = late > 0
      ? Math.round(todayRecords.filter(r => r.status === 'LATE').reduce((sum, r) => sum + r.lateMinutes, 0) / late)
      : 0;

    res.json({
      success: true,
      data: { totalEmployees, present, late, absent, avgLateMinutes },
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

module.exports = { getAll, checkIn, checkOut, getSummary, getHistory };
