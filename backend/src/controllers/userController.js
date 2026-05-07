const prisma = require('../prismaClient');
const bcrypt = require('bcryptjs');

/**
 * GET /api/users
 */
const getAll = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { 
        employee: { include: { department: true } }
      },
      orderBy: { createdAt: 'desc' },
    });

    // Use raw SQL because Prisma Client might not be updated with ManagerAccess model
    const access = await prisma.$queryRaw`SELECT * FROM "ManagerAccess"`;
    const accessMap = new Map(access.map(a => [a.userId, a]));

    const departments = await prisma.department.findMany();
    const deptMap = new Map(departments.map(d => [d.id, d.name]));

    res.json({
      success: true,
      data: users.map(user => {
        const ma = accessMap.get(user.id);
        return {
          id: user.id,
          username: user.username,
          role: user.role,
          employeeName: user.employee?.name || 'Admin',
          dept: user.role === 'MANAGER' 
            ? (ma?.manageAllDepts ? 'All Departments' : deptMap.get(ma?.managedDeptId) || '-')
            : user.employee?.department?.name || '-',
          managedDeptId: ma?.manageAllDepts ? 0 : ma?.managedDeptId,
          lastLogin: user.updatedAt,
        };
      }),
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
    const { password, role, managedDeptId } = req.body;
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

    if (managedDeptId !== undefined) {
      const isAll = parseInt(managedDeptId) === 0;
      const deptVal = isAll || managedDeptId === 'null' ? 'NULL' : parseInt(managedDeptId);
      const allDeptsVal = isAll ? 'TRUE' : 'FALSE';

      // Raw SQL Upsert for ManagerAccess
      await prisma.$executeRawUnsafe(`
        INSERT INTO "ManagerAccess" ("userId", "managedDeptId", "manageAllDepts")
        VALUES (${user.id}, ${deptVal}, ${allDeptsVal})
        ON CONFLICT ("userId") DO UPDATE SET
        "managedDeptId" = EXCLUDED."managedDeptId",
        "manageAllDepts" = EXCLUDED."manageAllDepts"
      `);
    }

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
    const { username, password, role, employeeId, managedDeptId } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ success: false, message: 'Username, password and role are required' });
    }

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

    if (managedDeptId !== undefined) {
      const isAll = parseInt(managedDeptId) === 0;
      const deptVal = isAll || managedDeptId === 'null' ? 'NULL' : parseInt(managedDeptId);
      const allDeptsVal = isAll ? 'TRUE' : 'FALSE';

      await prisma.$executeRawUnsafe(`
        INSERT INTO "ManagerAccess" ("userId", "managedDeptId", "manageAllDepts")
        VALUES (${user.id}, ${deptVal}, ${allDeptsVal})
      `);
    }

    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      const menus = ['dashboard', 'attendance', 'employees', 'shifts', 'locations', 'corrections', 'users', 'settings'];
      await prisma.menuPermission.createMany({
        data: menus.map(menu => ({ userId: user.id, menuKey: menu, canRead: true, canCreate: true, canUpdate: true, canDelete: true }))
      });
    } else if (role === 'MANAGER') {
      const menus = ['dashboard', 'attendance', 'employees', 'leave-requests'];
      await prisma.menuPermission.createMany({
        data: menus.map(menu => ({ userId: user.id, menuKey: menu, canRead: true, canCreate: false, canUpdate: false, canDelete: false }))
      });
    }

    res.status(201).json({ success: true, message: 'User created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateBiometrics = async (req, res) => {
  try {
    const { id } = req.params;
    const { facePhoto, faceDescriptor } = req.body;
    if (!facePhoto || !faceDescriptor) return res.status(400).json({ success: false, message: 'Face photo and descriptor are required' });
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) }, include: { employee: true } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    let employeeId = user.employeeId;
    if (!employeeId) {
      let dept = await prisma.department.findUnique({ where: { name: 'Management' } });
      if (!dept) dept = await prisma.department.create({ data: { name: 'Management' } });
      const newEmp = await prisma.employee.create({ data: { employeeCode: `ADM-${user.username.toUpperCase()}`, name: user.username, email: `${user.username}@company.com`, departmentId: dept.id, faceStatus: 'ENROLLED', facePhoto, faceDescriptor: JSON.parse(faceDescriptor) } });
      await prisma.user.update({ where: { id: user.id }, data: { employeeId: newEmp.id } });
      employeeId = newEmp.id;
    } else {
      await prisma.employee.update({ where: { id: employeeId }, data: { faceStatus: 'ENROLLED', facePhoto, faceDescriptor: JSON.parse(faceDescriptor) } });
    }
    res.json({ success: true, message: 'Biometrics updated successfully' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const getPermissions = async (req, res) => {
  try {
    const permissions = await prisma.menuPermission.findMany({ where: { userId: parseInt(req.params.id) } });
    res.json({ success: true, data: permissions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const updatePermissions = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { permissions } = req.body; 
    await prisma.$transaction(permissions.map(p => prisma.menuPermission.upsert({
        where: { userId_menuKey: { userId, menuKey: p.menuKey } },
        update: { canRead: p.canRead, canCreate: p.canCreate, canUpdate: p.canUpdate, canDelete: p.canDelete },
        create: { userId, menuKey: p.menuKey, canRead: p.canRead, canCreate: p.canCreate, canUpdate: p.canUpdate, canDelete: p.canDelete }
    })));
    res.json({ success: true, message: 'Permissions updated successfully' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const getEmployeeOptions = async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({ select: { id: true, name: true, employeeCode: true } });
    res.json({ success: true, data: employees });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const getDepartmentOptions = async (req, res) => {
  try {
    const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: departments });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getAll, create, update, remove, updateBiometrics, getPermissions, updatePermissions, getEmployeeOptions, getDepartmentOptions };
