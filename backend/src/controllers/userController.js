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

/**
 * POST /api/users
 */
const create = async (req, res) => {
  try {
    const { username, password, role, employeeId } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ success: false, message: 'Username, password and role are required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role,
        employeeId: employeeId ? parseInt(employeeId) : null,
      },
    });

    // If ADMIN, set default full permissions
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      const menus = ['dashboard', 'attendance', 'employees', 'shifts', 'locations', 'corrections', 'users', 'settings'];
      await prisma.menuPermission.createMany({
        data: menus.map(menu => ({
          userId: user.id,
          menuKey: menu,
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true
        }))
      });
    }

    res.status(201).json({ success: true, message: 'User created successfully', data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/users/:id/biometrics
 */
const updateBiometrics = async (req, res) => {
  try {
    const { id } = req.params;
    const { facePhoto, faceDescriptor } = req.body;

    if (!facePhoto || !faceDescriptor) {
      return res.status(400).json({ success: false, message: 'Face photo and descriptor are required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { employee: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let employeeId = user.employeeId;

    // If user has no employee record, create a dummy one
    if (!employeeId) {
      let dept = await prisma.department.findUnique({ where: { name: 'Management' } });
      if (!dept) dept = await prisma.department.create({ data: { name: 'Management' } });

      const newEmp = await prisma.employee.create({
        data: {
          employeeCode: `ADM-${user.username.toUpperCase()}`,
          name: user.username,
          email: `${user.username}@company.com`,
          departmentId: dept.id,
          faceStatus: 'ENROLLED',
          facePhoto,
          faceDescriptor: JSON.parse(faceDescriptor),
        }
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { employeeId: newEmp.id }
      });
      
      employeeId = newEmp.id;
    } else {
      // Update existing employee
      await prisma.employee.update({
        where: { id: employeeId },
        data: {
          faceStatus: 'ENROLLED',
          facePhoto,
          faceDescriptor: JSON.parse(faceDescriptor),
        }
      });
    }

    res.json({ success: true, message: 'Biometrics updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/users/:id/permissions
 */
const getPermissions = async (req, res) => {
  try {
    const permissions = await prisma.menuPermission.findMany({
      where: { userId: parseInt(req.params.id) }
    });
    res.json({ success: true, data: permissions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/users/:id/permissions
 */
const updatePermissions = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { permissions } = req.body; // Array of { menuKey, canRead, canCreate, canUpdate, canDelete }

    // Use transaction for consistency
    await prisma.$transaction(
      permissions.map(p => prisma.menuPermission.upsert({
        where: { userId_menuKey: { userId, menuKey: p.menuKey } },
        update: {
          canRead: p.canRead,
          canCreate: p.canCreate,
          canUpdate: p.canUpdate,
          canDelete: p.canDelete
        },
        create: {
          userId,
          menuKey: p.menuKey,
          canRead: p.canRead,
          canCreate: p.canCreate,
          canUpdate: p.canUpdate,
          canDelete: p.canDelete
        }
      }))
    );

    res.json({ success: true, message: 'Permissions updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove, updateBiometrics, getPermissions, updatePermissions };
