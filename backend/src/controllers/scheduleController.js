const prisma = require('../prismaClient');

const { handleControllerError } = require('../middleware/validate');
/**
 * GET /api/shifts
 */
const getAll = async (req, res) => {
  try {
    const shifts = await prisma.shift.findMany({
      include: {
        _count: { select: { employees: true } },
        employees: {
          select: {
            department: {
              select: {
                name: true
              }
            }
          }
        }
      },
    });
    res.json({ success: true, data: shifts });
  } catch (err) {
    handleControllerError(res, err, 'scheduleController');
  }
};

/**
 * POST /api/shifts
 */
const create = async (req, res) => {
  try {
    const { name, startTime, endTime, breakStart, breakEnd, gracePeriod, saturdayType, saturdayEndTime } = req.body;
    const shift = await prisma.shift.create({
      data: { 
        name, 
        startTime, 
        endTime, 
        breakStart, 
        breakEnd, 
        gracePeriod: Math.max(0, parseInt(gracePeriod) || 0),
        saturdayType: saturdayType || "HALF_DAY",
        saturdayEndTime: saturdayEndTime !== undefined ? saturdayEndTime : "13:00"
      },
    });
    res.status(201).json({ success: true, data: shift });
  } catch (err) {
    handleControllerError(res, err, 'scheduleController');
  }
};

/**
 * GET /api/shifts/employee/:empId
 */
const getEmployeeShift = async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: parseInt(req.params.empId) },
      include: { shift: true },
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.json({
      success: true,
      data: employee.shift || { name: 'No Shift Assigned', startTime: '--', endTime: '--' },
    });
  } catch (err) {
    handleControllerError(res, err, 'scheduleController');
  }
};

/**
 * PUT /api/shifts/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startTime, endTime, breakStart, breakEnd, gracePeriod, saturdayType, saturdayEndTime } = req.body;
    const shift = await prisma.shift.update({
      where: { id: parseInt(id) },
      data: { 
        name, 
        startTime, 
        endTime, 
        breakStart, 
        breakEnd, 
        gracePeriod: Math.max(0, parseInt(gracePeriod) || 0),
        saturdayType: saturdayType || "HALF_DAY",
        saturdayEndTime: saturdayEndTime !== undefined ? saturdayEndTime : "13:00"
      },
    });
    res.json({ success: true, data: shift });
  } catch (err) {
    handleControllerError(res, err, 'scheduleController');
  }
};

/**
 * DELETE /api/shifts/:id
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.shift.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: 'Shift deleted' });
  } catch (err) {
    handleControllerError(res, err, 'scheduleController');
  }
};
/**
 * GET /api/shifts/overrides
 */
const getOverrides = async (req, res) => {
  try {
    const overrides = await prisma.employeeShiftOverride.findMany({
      include: {
        employee: { select: { id: true, name: true, employeeCode: true, department: { select: { name: true } } } },
        shift: { select: { id: true, name: true } }
      },
      orderBy: { startDate: 'desc' }
    });
    res.json({ success: true, data: overrides });
  } catch (err) {
    handleControllerError(res, err, 'scheduleController');
  }
};

/**
 * POST /api/shifts/overrides
 */
const createOverrides = async (req, res) => {
  try {
    const { employeeIds, shiftId, startDate, endDate } = req.body;

    if (!employeeIds || employeeIds.length === 0 || !shiftId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
    }

    // Hanya ID karyawan valid (buang NaN/non-numerik agar tak error / salah karyawan)
    const validEmployeeIds = [...new Set(
      employeeIds.map(id => parseInt(id)).filter(id => Number.isInteger(id) && id > 0)
    )];
    if (validEmployeeIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada ID karyawan yang valid.' });
    }
    const parsedShiftId = parseInt(shiftId);
    if (!Number.isInteger(parsedShiftId)) {
      return res.status(400).json({ success: false, message: 'Shift tidak valid.' });
    }

    // Parse tanggal sebagai UTC-midnight (selaras bulk-generate & pembacaan absensi)
    const [sY, sM, sD] = String(startDate).slice(0, 10).split('-').map(Number);
    const [eY, eM, eD] = String(endDate).slice(0, 10).split('-').map(Number);
    const start = new Date(Date.UTC(sY, sM - 1, sD));
    const end = new Date(Date.UTC(eY, eM - 1, eD));
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return res.status(400).json({ success: false, message: 'Rentang tanggal tidak valid.' });
    }

    // Pastikan tidak ada conflict
    // Selesaikan konflik tumpang tindih (Roster Collision) dengan cara memotong/membagi range tanggal
    for (const parsedEmpId of validEmployeeIds) {
      const overlapping = await prisma.employeeShiftOverride.findMany({
        where: {
          employeeId: parsedEmpId,
          startDate: { lte: end },
          endDate: { gte: start }
        }
      });
      
      for (const ov of overlapping) {
        const ovStart = new Date(ov.startDate);
        const ovEnd = new Date(ov.endDate);
        
        if (ovStart.getTime() >= start.getTime() && ovEnd.getTime() <= end.getTime()) {
          // Kasus 1: Seluruhnya berada di dalam range baru -> Hapus
          await prisma.employeeShiftOverride.delete({ where: { id: ov.id } });
        } else if (ovStart.getTime() < start.getTime() && ovEnd.getTime() > end.getTime()) {
          // Kasus 2: Menutupi seluruh range baru -> Potong menjadi dua bagian (Kiri dan Kanan)
          const endBefore = new Date(start);
          endBefore.setUTCDate(endBefore.getUTCDate() - 1);
          
          await prisma.employeeShiftOverride.update({
            where: { id: ov.id },
            data: { endDate: endBefore }
          });
          
          const startAfter = new Date(end);
          startAfter.setUTCDate(startAfter.getUTCDate() + 1);
          
          await prisma.employeeShiftOverride.create({
            data: {
              employeeId: parsedEmpId,
              shiftId: ov.shiftId,
              startDate: startAfter,
              endDate: ovEnd
            }
          });
        } else if (ovStart.getTime() < start.getTime() && ovEnd.getTime() >= start.getTime() && ovEnd.getTime() <= end.getTime()) {
          // Kasus 3: Menumpuk di bagian awal range baru -> Kecilkan endDate
          const endBefore = new Date(start);
          endBefore.setUTCDate(endBefore.getUTCDate() - 1);
          
          await prisma.employeeShiftOverride.update({
            where: { id: ov.id },
            data: { endDate: endBefore }
          });
        } else if (ovStart.getTime() >= start.getTime() && ovStart.getTime() <= end.getTime() && ovEnd.getTime() > end.getTime()) {
          // Kasus 4: Menumpuk di bagian akhir range baru -> Kecilkan startDate
          const startAfter = new Date(end);
          startAfter.setUTCDate(startAfter.getUTCDate() + 1);
          
          await prisma.employeeShiftOverride.update({
            where: { id: ov.id },
            data: { startDate: startAfter }
          });
        }
      }
    }

    const overrideData = validEmployeeIds.map(empId => ({
      employeeId: empId,
      shiftId: parsedShiftId,
      startDate: start,
      endDate: end
    }));

    await prisma.employeeShiftOverride.createMany({
      data: overrideData
    });

    res.status(201).json({ success: true, message: `${validEmployeeIds.length} Data roster berhasil disimpan` });
  } catch (err) {
    handleControllerError(res, err, 'scheduleController');
  }
};

/**
 * POST /api/shifts/overrides/bulk-generate
 */
const bulkGenerateOverrides = async (req, res) => {
  try {
    const { startDate, endDate, groups } = req.body;

    if (!startDate || !endDate || !groups || !Array.isArray(groups)) {
      return res.status(400).json({ success: false, message: 'Data tidak lengkap atau format salah' });
    }

    // Parse dates to UTC midnight safely
    const [sYear, sMonth, sDay] = startDate.split('-').map(Number);
    const [eYear, eMonth, eDay] = endDate.split('-').map(Number);
    const start = new Date(Date.UTC(sYear, sMonth - 1, sDay));
    const end = new Date(Date.UTC(eYear, eMonth - 1, eDay));

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return res.status(400).json({ success: false, message: 'Rentang tanggal tidak valid' });
    }

    // Get all employee IDs across all groups to clear potential overlap records
    const allEmployeeIds = [];
    groups.forEach(g => {
      if (g.employeeIds && Array.isArray(g.employeeIds)) {
        g.employeeIds.forEach(id => {
          const parsed = parseInt(id);
          if (!isNaN(parsed) && !allEmployeeIds.includes(parsed)) {
            allEmployeeIds.push(parsed);
          }
        });
      }
    });

    if (allEmployeeIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada karyawan yang dipilih' });
    }

    // 1. Clear existing overrides for selected employees in the range
    await prisma.employeeShiftOverride.deleteMany({
      where: {
        employeeId: { in: allEmployeeIds },
        startDate: { lte: end },
        endDate: { gte: start }
      }
    });

    const overridesToCreate = [];

    // 2. Loop through each group and generate dates
    for (const group of groups) {
      const empIds = (group.employeeIds || []).map(id => parseInt(id)).filter(id => !isNaN(id));
      const pattern = group.pattern; // array of shiftId or null (represented as OFF)
      
      if (empIds.length === 0 || !pattern || !Array.isArray(pattern) || pattern.length === 0) {
        continue;
      }

      let current = new Date(start);
      let diffDays = 0;

      while (current <= end) {
        const cycleIndex = diffDays % pattern.length;
        const shiftId = pattern[cycleIndex];

        // Only create an override if the shift is NOT null/undefined (which represents OFF)
        if (shiftId !== null && shiftId !== undefined && shiftId !== "") {
          const targetDate = new Date(current);
          const parsedShiftId = parseInt(shiftId);

          if (!isNaN(parsedShiftId)) {
            empIds.forEach(empId => {
              overridesToCreate.push({
                employeeId: empId,
                shiftId: parsedShiftId,
                startDate: targetDate,
                endDate: targetDate
              });
            });
          }
        }

        // Move to the next day in UTC
        current.setUTCDate(current.getUTCDate() + 1);
        diffDays++;
      }
    }

    // 3. Insert all new overrides
    if (overridesToCreate.length > 0) {
      await prisma.employeeShiftOverride.createMany({
        data: overridesToCreate
      });
    }

    // Record audit log
    if (req.user) {
      try {
        const { recordAuditLog } = require('./auditLogController');
        recordAuditLog({
          userId: req.user.id,
          username: req.user.username,
          role: req.user.role,
          action: 'CREATE',
          entity: 'EmployeeShiftOverride',
          details: {
            startDate,
            endDate,
            employeeCount: allEmployeeIds.length,
            recordsCreated: overridesToCreate.length
          },
          ipAddress: req.ip
        });
      } catch (auditErr) {
        console.error('Gagal mencatat audit log roster bulk-generate:', auditErr.message);
      }
    }

    res.status(201).json({
      success: true,
      message: `Roster berhasil dibuat. Menghasilkan ${overridesToCreate.length} jadwal override untuk ${allEmployeeIds.length} karyawan.`
    });

  } catch (err) {
    handleControllerError(res, err, 'scheduleController');
  }
};

/**
 * DELETE /api/shifts/overrides/:id
 */
const deleteOverride = async (req, res) => {
  try {
    await prisma.employeeShiftOverride.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true, message: 'Data roster dihapus' });
  } catch (err) {
    handleControllerError(res, err, 'scheduleController');
  }
};

module.exports = { getAll, create, getEmployeeShift, update, remove, getOverrides, createOverrides, deleteOverride, bulkGenerateOverrides };
