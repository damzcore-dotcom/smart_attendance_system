const prisma = require('../prismaClient');
const { calculateLateness, resolveStatus } = require('../utils/lateCalculator');

/**
 * POST /api/corrections
 */
const create = async (req, res) => {
  try {
    const { employeeId, date, type, time, reason } = req.body;

    if (!date || !type || !time || !reason) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const correction = await prisma.correctionRequest.create({
      data: {
        employeeId: parseInt(employeeId),
        date: new Date(date),
        type,
        time,
        reason,
      },
    });

    res.status(201).json({ success: true, message: 'Correction request submitted', data: correction });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/corrections
 */
const getAll = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;

    const corrections = await prisma.correctionRequest.findMany({
      where,
      include: { employee: { include: { department: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: corrections.map(c => ({
        id: c.id,
        employeeName: c.employee.name,
        dept: c.employee.department.name,
        date: c.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        type: c.type,
        time: c.time,
        reason: c.reason,
        status: c.status,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/corrections/:id
 */
const review = async (req, res) => {
  try {
    const { status, reviewNote } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be APPROVED or REJECTED' });
    }

    const correctionId = parseInt(req.params.id);
    const correction = await prisma.correctionRequest.findUnique({
      where: { id: correctionId },
    });

    if (!correction) {
      return res.status(404).json({ success: false, message: 'Correction request not found' });
    }

    const updatedCorrection = await prisma.correctionRequest.update({
      where: { id: correctionId },
      data: { status, reviewNote },
    });

    if (status === 'APPROVED') {
      const { employeeId, date, type, time } = correction;
      const today = new Date(date);
      today.setHours(0, 0, 0, 0);

      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: { shift: true },
      });

      // Parse correction time (HH:mm)
      const [h, m] = time.split(':').map(Number);
      const correctionDateTime = new Date(today);
      correctionDateTime.setHours(h, m, 0, 0);

      // Find existing attendance
      const existing = await prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId, date: today } },
      });

      const updateData = { mode: 'Manual' };
      if (type === 'In') {
        updateData.checkIn = correctionDateTime;
      } else {
        updateData.checkOut = correctionDateTime;
      }

      const finalCheckIn = type === 'In' ? correctionDateTime : existing?.checkIn;
      const finalCheckOut = type === 'Out' ? correctionDateTime : existing?.checkOut;

      let attStatus = 'PRESENT';
      let lateMinutes = 0;

      if (finalCheckIn) {
        const shiftStart = employee.shift?.startTime || '08:00';
        const gracePeriod = employee.shift?.gracePeriod || 15;
        const calc = calculateLateness(finalCheckIn, shiftStart, gracePeriod);
        attStatus = calc.status;
        lateMinutes = calc.lateMinutes;
      }

      const finalStatus = resolveStatus(finalCheckIn, finalCheckOut, attStatus);

      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId, date: today } },
        update: { ...updateData, status: finalStatus, lateMinutes },
        create: { 
          employeeId, 
          date: today, 
          ...updateData, 
          status: finalStatus, 
          lateMinutes 
        },
      });
    }

    res.json({ success: true, message: `Correction ${status.toLowerCase()}`, data: updatedCorrection });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { create, getAll, review };
