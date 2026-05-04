const prisma = require('../prismaClient');

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

    const correction = await prisma.correctionRequest.update({
      where: { id: parseInt(req.params.id) },
      data: { status, reviewNote },
    });

    res.json({ success: true, message: `Correction ${status.toLowerCase()}`, data: correction });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { create, getAll, review };
