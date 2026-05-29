const prisma = require('../prismaClient');

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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Pastikan tidak ada conflict
    // Selesaikan konflik tumpang tindih (Roster Collision) dengan cara memotong/membagi range tanggal
    for (const empId of employeeIds) {
      const parsedEmpId = parseInt(empId);
      
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
          endBefore.setDate(endBefore.getDate() - 1);
          
          await prisma.employeeShiftOverride.update({
            where: { id: ov.id },
            data: { endDate: endBefore }
          });
          
          const startAfter = new Date(end);
          startAfter.setDate(startAfter.getDate() + 1);
          
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
          endBefore.setDate(endBefore.getDate() - 1);
          
          await prisma.employeeShiftOverride.update({
            where: { id: ov.id },
            data: { endDate: endBefore }
          });
        } else if (ovStart.getTime() >= start.getTime() && ovStart.getTime() <= end.getTime() && ovEnd.getTime() > end.getTime()) {
          // Kasus 4: Menumpuk di bagian akhir range baru -> Kecilkan startDate
          const startAfter = new Date(end);
          startAfter.setDate(startAfter.getDate() + 1);
          
          await prisma.employeeShiftOverride.update({
            where: { id: ov.id },
            data: { startDate: startAfter }
          });
        }
      }
    }

    const overrideData = employeeIds.map(empId => ({
      employeeId: parseInt(empId),
      shiftId: parseInt(shiftId),
      startDate: start,
      endDate: end
    }));

    await prisma.employeeShiftOverride.createMany({
      data: overrideData
    });

    res.status(201).json({ success: true, message: `${employeeIds.length} Data roster berhasil disimpan` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, getEmployeeShift, update, remove, getOverrides, createOverrides, deleteOverride };
