const prisma = require('../prismaClient');

/**
 * POST /api/leave
 * Employee submits a leave request
 */
const create = async (req, res) => {
  try {
    const { employeeId, startDate, endDate, type, reason } = req.body;

    if (!employeeId || !startDate || !endDate || !type || !reason) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        employeeId: parseInt(employeeId),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        type,
        reason
      }
    });

    res.json({ success: true, message: 'Leave request submitted successfully', data: leave });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/leave
 * Admin lists all leave requests
 */
const getAll = async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) {
      where.employee = { name: { contains: search, mode: 'insensitive' } };
    }

    const requests = await prisma.leaveRequest.findMany({
      where,
      include: { employee: { select: { name: true, employeeCode: true, department: true } } },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: requests.map(r => ({
        ...r,
        employeeName: r.employee.name,
        employeeCode: r.employee.employeeCode,
        dept: r.employee.department.name
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/leave/employee/:empId
 * Employee lists their own requests
 */
const getByEmployee = async (req, res) => {
  try {
    const empId = parseInt(req.params.empId);
    const requests = await prisma.leaveRequest.findMany({
      where: { employeeId: empId },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/leave/:id/review
 * Admin approves or rejects
 */
const review = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, reviewNote } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const leave = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true }
    });

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: { status, reviewNote }
    });

    // AUTO ATTENDANCE LOGIC
    if (status === 'APPROVED') {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      const attStatus = leave.type.toUpperCase(); // CUTI, SAKIT, IZIN

      let curr = new Date(start);
      while (curr <= end) {
        const dateKey = new Date(curr);
        dateKey.setHours(0, 0, 0, 0);

        await prisma.attendance.upsert({
          where: { employeeId_date: { employeeId: leave.employeeId, date: dateKey } },
          update: { status: attStatus, mode: 'Leave System', notes: `Approved ${leave.type}: ${leave.reason}` },
          create: { employeeId: leave.employeeId, date: dateKey, status: attStatus, mode: 'Leave System', notes: `Approved ${leave.type}: ${leave.reason}` }
        });

        curr.setDate(curr.getDate() + 1);
      }
    }

    // Notify employee
    await prisma.notification.create({
      data: {
        employeeId: leave.employeeId,
        title: `Leave Request ${status}`,
        message: `Your ${leave.type} request for ${leave.startDate.toLocaleDateString()} to ${leave.endDate.toLocaleDateString()} has been ${status.toLowerCase()}. ${reviewNote ? `Note: ${reviewNote}` : ''}`
      }
    });

    res.json({ success: true, message: `Request ${status.toLowerCase()} successfully`, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { create, getAll, getByEmployee, review };
