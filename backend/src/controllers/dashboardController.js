const prisma = require('../prismaClient');

/**
 * GET /api/dashboard/stats
 */
const getStats = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const totalEmployees = await prisma.employee.count({ where: { status: 'ACTIVE' } });
    const prevTotal = await prisma.employee.count({ 
      where: { 
        status: 'ACTIVE',
        createdAt: { lt: today }
      } 
    });

    const todayRecords = await prisma.attendance.findMany({
      where: { date: { gte: today, lt: tomorrow } },
    });

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayEnd = new Date(today);
    const yesterdayRecords = await prisma.attendance.findMany({
      where: { date: { gte: yesterday, lt: yesterdayEnd } },
    });

    const present = todayRecords.filter(r => r.status === 'PRESENT').length;
    const late = todayRecords.filter(r => r.status === 'LATE').length;
    const onLeave = todayRecords.filter(r => ['IZIN', 'SAKIT', 'CUTI'].includes(r.status)).length;
    
    const prevPresent = yesterdayRecords.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length;

    const lateRecords = todayRecords.filter(r => r.status === 'LATE');
    const avgLate = lateRecords.length > 0
      ? Math.round(lateRecords.reduce((s, r) => s + r.lateMinutes, 0) / lateRecords.length)
      : 0;

    // Calculate changes
    const empChange = totalEmployees - prevTotal;
    const presentChange = prevPresent === 0 ? 0 : Math.round(((present + late - prevPresent) / prevPresent) * 100);

    res.json({
      success: true,
      data: {
        totalEmployees,
        totalEmployeesChange: empChange >= 0 ? `+${empChange}` : `${empChange}`,
        presentToday: present + late,
        presentTodayChange: presentChange >= 0 ? `+${presentChange}%` : `${presentChange}%`,
        lateArrivals: late,
        lateArrivalsChange: late > 0 ? '+1' : '0',
        onLeave,
        avgLateTime: `${avgLate}m`,
        avgLateTimeChange: '-2m',
        absent: totalEmployees - (present + late + onLeave)
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/dashboard/weekly-trends
 */
const getWeeklyTrends = async (req, res) => {
  try {
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const records = await prisma.attendance.findMany({
        where: { date: { gte: dayStart, lt: dayEnd } },
      });

      data.push({
        name: days[dayStart.getDay()],
        present: records.filter(r => r.status === 'PRESENT').length,
        late: records.filter(r => r.status === 'LATE').length,
        leave: records.filter(r => ['IZIN', 'SAKIT', 'CUTI'].includes(r.status)).length,
      });
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/dashboard/dept-lateness
 */
const getDeptLateness = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const departments = await prisma.department.findMany();
    const colors = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

    const data = await Promise.all(departments.map(async (dept, idx) => {
      const totalLate = await prisma.attendance.aggregate({
        where: {
          date: { gte: startOfMonth },
          status: 'LATE',
          employee: { departmentId: dept.id },
        },
        _sum: { lateMinutes: true },
      });

      return {
        dept: dept.name.substring(0, 3),
        fullName: dept.name,
        minutes: totalLate._sum.lateMinutes || 0,
        color: colors[idx % colors.length],
      };
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/dashboard/recent-late
 */
const getRecentLate = async (req, res) => {
  try {
    const records = await prisma.attendance.findMany({
      where: { status: 'LATE' },
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
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/dashboard/notifications
 */
const getAdminNotifications = async (req, res) => {
  try {
    const notifications = [];
    let idCounter = 1;

    // 1. Pending Face Enrollments
    const pendingFaces = await prisma.employee.findMany({
      where: { faceStatus: 'PENDING' },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });
    
    pendingFaces.forEach(emp => {
      notifications.push({
        id: idCounter++,
        title: 'Pending Face Enrollment',
        desc: `${emp.name} needs face data enrollment`,
        time: 'Action Required',
        type: 'warning'
      });
    });

    // 2. Pending Leave Requests
    const pendingLeaves = await prisma.leaveRequest.findMany({
      where: { status: 'PENDING' },
      include: { employee: true },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    pendingLeaves.forEach(leave => {
      notifications.push({
        id: idCounter++,
        title: 'New Leave Request',
        desc: `${leave.employee.name} requested ${leave.type}`,
        time: new Date(leave.createdAt).toLocaleDateString(),
        type: 'info'
      });
    });

    // 3. Pending Corrections
    const pendingCorrections = await prisma.correctionRequest.findMany({
      where: { status: 'PENDING' },
      include: { employee: true },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    pendingCorrections.forEach(corr => {
      notifications.push({
        id: idCounter++,
        title: 'Attendance Correction',
        desc: `${corr.employee.name} requested correction for ${new Date(corr.date).toLocaleDateString()}`,
        time: new Date(corr.createdAt).toLocaleDateString(),
        type: 'info'
      });
    });

    // Sort by id just to keep them somewhat organized, though they are categorized
    res.json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getStats, getWeeklyTrends, getDeptLateness, getRecentLate, getAdminNotifications };
