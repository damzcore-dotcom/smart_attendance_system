const prisma = require('../prismaClient');
const { calculateLateness, resolveStatus, parsePenaltySettings } = require('../utils/lateCalculator');
const { getUTCToday, toUTCMidnight } = require('../utils/dateHelper');

const { handleControllerError } = require('../middleware/validate');
/**
 * POST /api/corrections
 */
const create = async (req, res) => {
  try {
    const { employeeId, date, type, time, reason } = req.body;

    if (!date || !type || !time || !reason) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const empId = parseInt(employeeId);
    const correction = await prisma.correctionRequest.create({
      data: {
        employeeId: empId,
        date: new Date(date),
        type,
        time,
        reason,
      },
    });

    // Lupa finger masuk → setelah ajukan Koreksi tipe "In" untuk HARI INI, buat check-in PROVISIONAL
    // agar tombol checkout terbuka. Request tetap PENDING untuk ditinjau/diaudit HRD.
    let provisional = false;
    if (type === 'In') {
      const today = getUTCToday();
      const reqDate = toUTCMidnight(new Date(date));
      if (reqDate.getTime() === today.getTime()) {
        const existing = await prisma.attendance.findUnique({
          where: { employeeId_date: { employeeId: empId, date: today } },
        });
        if (!existing || !existing.checkIn) {
          const settingsList = await prisma.settings.findMany();
          const { roundingConfig } = parsePenaltySettings(settingsList);
          const timezoneOffset = parseInt(settingsList.find(s => s.key === 'timezoneOffset')?.value || '420', 10);
          const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
          const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
          const globalGracePeriod = parseInt(settingsList.find(s => s.key === 'gracePeriod')?.value || '15', 10);

          const employee = await prisma.employee.findUnique({ where: { id: empId }, include: { shift: true } });
          const effectiveShift = employee?.shift || null;
          const shiftStart = effectiveShift?.startTime || '08:00';
          let shiftEnd = effectiveShift?.endTime || '17:00';
          const gracePeriod = effectiveShift ? effectiveShift.gracePeriod : globalGracePeriod;
          if (today.getUTCDay() === 6) {
            const satType = effectiveShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
            if (satType === 'HALF_DAY') shiftEnd = effectiveShift?.saturdayEndTime || satCheckoutTime;
          }

          const [h, m] = time.split(':').map(Number);
          const checkInInstant = new Date(today.getTime() + (h * 60 + m - timezoneOffset) * 60000);
          const calc = calculateLateness(checkInInstant, shiftStart, gracePeriod, shiftEnd, roundingConfig);

          const provisionalData = {
            checkIn: checkInInstant,
            status: calc.status,
            lateMinutes: calc.lateMinutes,
            mode: 'Koreksi',
            source: 'correction',
            notes: 'Check-in via pengajuan Koreksi (menunggu peninjauan)',
          };
          await prisma.attendance.upsert({
            where: { employeeId_date: { employeeId: empId, date: today } },
            update: provisionalData,
            create: { employeeId: empId, date: today, ...provisionalData },
          });
          provisional = true;
        }
      }
    }

    res.status(201).json({ success: true, message: 'Correction request submitted', data: correction, provisional });
  } catch (err) {
    handleControllerError(res, err, 'correctionController');
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
    handleControllerError(res, err, 'correctionController');
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
      const { penaltyRules, roundingConfig } = parsePenaltySettings(settingsList);
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

        const calc = calculateLateness(finalCheckIn, shiftStart, gracePeriod, shiftEnd, roundingConfig);
        attStatus = calc.status;
        lateMinutes = calc.lateMinutes;
      }

      const finalStatus = resolveStatus(finalCheckIn, finalCheckOut, attStatus, today, penaltyRules, shiftEnd, shiftStart);

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

    // Jika DITOLAK & koreksi tipe "In": batalkan check-in provisional
    if (status === 'REJECTED' && correction.type === 'In') {
      const provDate = toUTCMidnight(new Date(correction.date));
      const att = await prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId: correction.employeeId, date: provDate } },
      });
      // Pastikan ini benar-benar data provisional (dari pengajuan)
      if (att && att.mode === 'Koreksi' && att.source === 'correction') {
        if (!att.checkOut) {
          // Belum ada absen pulang sama sekali -> hapus utuh
          await prisma.attendance.delete({ where: { id: att.id } });
        } else {
          // Sudah ada absen pulang -> kembalikan checkIn ke null
          const settingsList = await prisma.settings.findMany();
          const { penaltyRules } = parsePenaltySettings(settingsList);
          const finalStatus = resolveStatus(null, att.checkOut, 'ABSENT', provDate, penaltyRules, '17:00', '08:00');
          
          await prisma.attendance.update({ 
            where: { id: att.id },
            data: { 
              checkIn: null,
              lateMinutes: 0,
              status: finalStatus,
              mode: 'Sistem', // Kembalikan ke mode normal
              source: 'system',
              notes: 'Pengajuan koreksi masuk ditolak'
            }
          });
        }
      }
    }

    res.json({ success: true, message: `Correction ${status.toLowerCase()}`, data: updatedCorrection });
  } catch (err) {
    handleControllerError(res, err, 'correctionController');
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
    handleControllerError(res, err, 'correctionController');
  }
};

module.exports = { create, getAll, review, getByEmployee };
