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

      // Fetch global settings
      const settingsList = await prisma.settings.findMany();
      const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
      const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
      const globalGracePeriod = parseInt(settingsList.find(s => s.key === 'gracePeriod')?.value || '15', 10);

      // Fetch shift overrides for today
      const dateStart = new Date(today);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(today);
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
        const shiftStart = effectiveShift?.startTime || '08:00';
        let shiftEnd = effectiveShift?.endTime || '17:00';
        const gracePeriod = effectiveShift ? effectiveShift.gracePeriod : globalGracePeriod;

        if (today.getDay() === 6) {
          const satType = effectiveShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
          if (satType === 'HALF_DAY') {
            shiftEnd = effectiveShift?.saturdayEndTime || satCheckoutTime;
          }
        }

        const calc = calculateLateness(finalCheckIn, shiftStart, gracePeriod, shiftEnd);
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

/**
 * GET /api/corrections/employee/:empId
 */
const getByEmployee = async (req, res) => {
  try {
    const empId = parseInt(req.params.empId);
    const corrections = await prisma.correctionRequest.findMany({
      where: { employeeId: empId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: corrections.map(c => ({
        id: c.id,
        date: c.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        type: c.type,
        time: c.time,
        reason: c.reason,
        status: c.status,
        reviewNote: c.reviewNote,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { create, getAll, review, getByEmployee };
