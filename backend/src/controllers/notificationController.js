const prisma = require('../prismaClient');

const { handleControllerError } = require('../middleware/validate');
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
    handleControllerError(res, err, 'notificationController');
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
    handleControllerError(res, err, 'notificationController');
  }
};

module.exports = { getByEmployee, markAsRead };
