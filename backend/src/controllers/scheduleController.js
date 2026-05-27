const prisma = require('../prismaClient');

/**
 * GET /api/shifts
 */
const getAll = async (req, res) => {
  try {
    const shifts = await prisma.shift.findMany({
      include: { _count: { select: { employees: true } } },
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
    const { name, startTime, endTime, breakStart, breakEnd, gracePeriod } = req.body;
    const shift = await prisma.shift.create({
      data: { name, startTime, endTime, breakStart, breakEnd, gracePeriod: Math.max(0, parseInt(gracePeriod) || 0) },
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
    const { name, startTime, endTime, breakStart, breakEnd, gracePeriod } = req.body;
    const shift = await prisma.shift.update({
      where: { id: parseInt(id) },
      data: { name, startTime, endTime, breakStart, breakEnd, gracePeriod: Math.max(0, parseInt(gracePeriod) || 0) },
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
    // Karena kita tidak ingin ada multiple overrides for the same exact date,
    // Kita bisa delete override lama yang berada di rentang ini untuk employee tersebut
    await prisma.employeeShiftOverride.deleteMany({
      where: {
        employeeId: { in: employeeIds },
        startDate: { lte: end },
        endDate: { gte: start }
      }
    });

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
