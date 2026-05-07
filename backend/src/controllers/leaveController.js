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
        reason,
        medicalAttachment: req.body.medicalAttachment || null
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
    const { status, search, dept } = req.query;
    const where = {};
    if (status && status !== 'All') where.status = status;
    
    const employeeFilter = {};
    if (search) employeeFilter.name = { contains: search, mode: 'insensitive' };
    if (dept && dept !== 'All') employeeFilter.department = { name: dept };
    
    if (Object.keys(employeeFilter).length > 0) {
      where.employee = employeeFilter;
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

    // AUTO ATTENDANCE LOGIC & QUOTA DEDUCTION
    if (status === 'APPROVED') {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      
      // Calculate duration in days
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      // Deduct from quota if type is 'Cuti'
      if (leave.type === 'Cuti') {
        const employee = await prisma.employee.findUnique({ where: { id: leave.employeeId } });
        if (employee.remainingLeave < diffDays) {
          return res.status(400).json({ success: false, message: `Insufficient leave quota. Remaining: ${employee.remainingLeave} days.` });
        }

        await prisma.employee.update({
          where: { id: leave.employeeId },
          data: { remainingLeave: { decrement: diffDays } }
        });
      }

      // Mapping leave type to database AttStatus enum
      const statusMap = {
        'CUTI': 'CUTI',
        'SAKIT': 'SAKIT',
        'IZIN': 'IZIN'
      };
      const attStatus = statusMap[leave.type.toUpperCase()] || 'IZIN';

      let curr = new Date(start);
      while (curr <= end) {
        const dateKey = new Date(curr);
        dateKey.setHours(0, 0, 0, 0);

        const existingAtt = await prisma.attendance.findUnique({
          where: { 
            employeeId_date: { 
              employeeId: leave.employeeId, 
              date: dateKey 
            } 
          }
        });

        const attData = {
          status: attStatus,
          mode: 'Leave System',
          notes: `Approved ${leave.type}: ${leave.reason}`
        };

        if (existingAtt) {
          await prisma.attendance.update({
            where: { id: existingAtt.id },
            data: attData
          });
        } else {
          await prisma.attendance.create({
            data: {
              ...attData,
              employeeId: leave.employeeId,
              date: dateKey
            }
          });
        }

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

/**
 * POST /api/leave/mass
 * Admin applies leave to all employees (e.g., Eid Leave)
 */
const massApply = async (req, res) => {
  try {
    const { startDate, endDate, type, reason, deductQuota = false } = req.body;

    if (!startDate || !endDate || !type || !reason) {
      return res.status(400).json({ success: false, message: 'Start date, end date, type, and reason are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Calculate duration
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const employees = await prisma.employee.findMany({ where: { status: 'ACTIVE' } });

    // Transaction for safety
    await prisma.$transaction(async (tx) => {
      // 1. Save Mass Leave Event Record
      await tx.massLeave.create({
        data: {
          startDate: start,
          endDate: end,
          type,
          reason
        }
      });

      for (const emp of employees) {
        // 1. Deduct Quota if needed
        if (deductQuota && type === 'Cuti') {
          if (emp.remainingLeave >= diffDays) {
            await tx.employee.update({
              where: { id: emp.id },
              data: { remainingLeave: { decrement: diffDays } }
            });
          }
        }

        // 2. Create Attendance Records
        let curr = new Date(start);
        while (curr <= end) {
          const dateKey = new Date(curr);
          dateKey.setHours(0, 0, 0, 0);

          await tx.attendance.upsert({
            where: { employeeId_date: { employeeId: emp.id, date: dateKey } },
            update: {
              status: type.toUpperCase() === 'CUTI' ? 'CUTI' : 'HOLIDAY',
              mode: 'Mass Leave',
              notes: `[Mass Leave] ${reason}`
            },
            create: {
              employeeId: emp.id,
              date: dateKey,
              status: type.toUpperCase() === 'CUTI' ? 'CUTI' : 'HOLIDAY',
              mode: 'Mass Leave',
              notes: `[Mass Leave] ${reason}`
            }
          });

          curr.setDate(curr.getDate() + 1);
        }
      }
    });

    res.json({ success: true, message: `Mass leave applied to ${employees.length} employees.` });
  } catch (err) {
    console.error('Mass leave error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/leave/mass
 * Admin lists all mass leave events
 */
const getMassLeaves = async (req, res) => {
  try {
    const list = await prisma.massLeave.findMany({
      orderBy: { startDate: 'desc' }
    });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { create, getAll, getByEmployee, review, massApply, getMassLeaves };
