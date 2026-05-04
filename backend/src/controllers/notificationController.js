const prisma = require('../prismaClient');

/**
 * GET /api/notifications/:employeeId
 */
const getByEmployee = async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { employeeId: parseInt(req.params.employeeId) },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/notifications/:id/read
 */
const markAsRead = async (req, res) => {
  try {
    await prisma.notification.update({
      where: { id: parseInt(req.params.id) },
      data: { isRead: true },
    });
    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getByEmployee, markAsRead };
