const prisma = require('../prismaClient');
const bcrypt = require('bcryptjs');

/**
 * GET /api/users
 */
const getAll = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { employee: { include: { department: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: users.map(user => ({
        id: user.id,
        username: user.username,
        role: user.role,
        employeeName: user.employee?.name || 'Admin',
        dept: user.employee?.department?.name || '-',
        lastLogin: user.updatedAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/users/:id
 */
const update = async (req, res) => {
  try {
    const { password, role } = req.body;
    const data = {};

    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }
    if (role) {
      data.role = role;
    }

    const user = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data,
    });

    res.json({ success: true, message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/users/:id
 */
const remove = async (req, res) => {
  try {
    await prisma.user.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, update, remove };
