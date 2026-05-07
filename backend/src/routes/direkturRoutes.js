const express = require('express');
const router = express.Router();
const { verifyToken, requireDirektur } = require('../middleware/auth');
const prisma = require('../prismaClient');
const { resolveStatus } = require('../utils/lateCalculator');

// All routes require valid token + DIREKTUR/ADMIN/SUPER_ADMIN
router.use(verifyToken, requireDirektur);

// GET /api/direktur/stats — Summary statistics
router.get('/stats', async (req, res) => {
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
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/direktur/attendance — All attendance records (read-only)
router.get('/attendance', async (req, res) => {
  try {
    const { period = 'today', dept, status, search, section, position, startDate, endDate, page = 1, limit = 50 } = req.query;

    let dateFilter = {};
    const now = new Date();
    if (period === 'today') {
      const start = new Date(now); start.setHours(0,0,0,0);
      const end = new Date(now); end.setHours(23,59,59,999);
      dateFilter = { gte: start, lte: end };
    } else if (period === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());  start.setHours(0,0,0,0);
      const end = new Date(now); end.setHours(23,59,59,999);
      dateFilter = { gte: start, lte: end };
    } else if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now); end.setHours(23,59,59,999);
      dateFilter = { gte: start, lte: end };
    } else if (period === 'custom' && startDate && endDate) {
      dateFilter = { gte: new Date(startDate), lte: new Date(new Date(endDate).setHours(23,59,59,999)) };
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

    // Logic for Mangkir (Absent)
    if (status === 'Mangkir' || status === 'Absent') {
      const allEmployees = await prisma.employee.findMany({
        where: empWhere,
        include: { department: true }
      });

      const attendedIds = (await prisma.attendance.findMany({
        where: { date: dateFilter, employee: empWhere },
        select: { employeeId: true }
      })).map(a => a.employeeId);

      const mangkirList = allEmployees.filter(e => !attendedIds.includes(e.id));
      const total = mangkirList.length;
      const paginated = mangkirList.slice(skip, skip + parseInt(limit));

      const finalData = paginated.map(e => ({
        id: `mangkir-${e.id}`,
        date: dateFilter.gte || new Date(),
        nik: e.employeeCode,
        name: e.name,
        dept: e.department?.name || '-',
        section: e.section || '-',
        position: e.position || '-',
        checkIn: '-',
        checkOut: '-',
        status: 'Mangkir',
        lateMinutes: 0
      }));

      return res.json({ success: true, data: finalData, total, totalPages: Math.ceil(total / limit) });
    }

    const where = {
      ...(Object.keys(dateFilter).length && { date: dateFilter }),
      ...(status && { status: status === 'Present' ? 'PRESENT' : status === 'Late' ? 'LATE' : status }),
      employee: empWhere
    };

    const [records, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [{ date: 'desc' }, { employee: { employeeCode: 'asc' } }],
        include: {
          employee: {
            include: { department: true }
          }
        }
      }),
      prisma.attendance.count({ where }),
    ]);

    const formatted = records.map(r => ({
      id: r.id,
      date: r.date,
      nik: r.employee.employeeCode,
      name: r.employee.name,
      dept: r.employee.department?.name || '-',
      section: r.employee.section || '-',
      position: r.employee.position || '-',
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      status: resolveStatus(r.checkIn, r.checkOut, r.status) === 'PRESENT' ? 'Present' : 
              resolveStatus(r.checkIn, r.checkOut, r.status) === 'LATE' ? 'Late' : 
              resolveStatus(r.checkIn, r.checkOut, r.status) === 'MANGKIR' ? 'Mangkir' : 'Absent',
      lateMinutes: r.lateMinutes,
    }));

    res.json({ success: true, data: formatted, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/direktur/leave — All leave requests (read-only)
router.get('/leave', async (req, res) => {
  try {
    const { status, dept, type, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      ...(status && status !== 'ALL' && { status }),
      ...(type && type !== 'ALL' && { type }),
      ...(dept && { employee: { department: { name: dept } } }),
    };

    const [records, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
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
      reason: r.reason,
      status: r.status,
      reviewNote: r.reviewNote || '-',
      medicalAttachment: r.medicalAttachment,
      createdAt: r.createdAt,
    }));

    res.json({ success: true, data: formatted, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/direktur/attendance-options — dynamic organizational options based on filters
router.get('/attendance-options', async (req, res) => {
  try {
    const { period, date, startDate, endDate, dept, search } = req.query;
    const where = {};

    // Date filtering (matching logic in /attendance)
    const now = new Date();
    if (period === 'today' || (!period && !date && !startDate)) {
      const start = new Date(now); start.setHours(0,0,0,0);
      const end = new Date(now); end.setHours(23,59,59,999);
      where.date = { gte: start, lte: end };
    } else if (period === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());  start.setHours(0,0,0,0);
      const end = new Date(now); end.setHours(23,59,59,999);
      where.date = { gte: start, lte: end };
    } else if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now); end.setHours(23,59,59,999);
      where.date = { gte: start, lte: end };
    } else if (period === 'custom' && startDate && endDate) {
      where.date = { gte: new Date(startDate), lte: new Date(new Date(endDate).setHours(23,59,59,999)) };
    } else if (date) {
      const d = new Date(date);
      where.date = { gte: d, lt: new Date(new Date(d).setDate(d.getDate() + 1)) };
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

    const records = await prisma.attendance.findMany({
      where: { ...where, employee: employeeWhere },
      select: {
        checkIn: true,
        checkOut: true,
        status: true,
        employee: {
          select: {
            department: { select: { id: true, name: true } },
            section: true,
            position: true
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
      const s = resolveStatus(r.checkIn, r.checkOut, r.status);
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
        statuses: Array.from(statuses).sort(),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/direktur/departments — for backwards compatibility or simple list
router.get('/departments', async (req, res) => {
  try {
    const depts = await prisma.department.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: depts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
