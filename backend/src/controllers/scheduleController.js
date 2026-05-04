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
      data: { name, startTime, endTime, breakStart, breakEnd, gracePeriod: parseInt(gracePeriod) || 15 },
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

module.exports = { getAll, create, getEmployeeShift };
