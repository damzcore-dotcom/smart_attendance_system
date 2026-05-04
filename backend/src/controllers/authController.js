const prisma = require('../prismaClient');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken } = require('../middleware/auth');

/**
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { employee: { include: { department: true } } },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in DB
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employee: user.employee ? {
          id: user.employee.id,
          name: user.employee.name,
          employeeCode: user.employee.employeeCode,
          department: user.employee.department.name,
          position: user.employee.position,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.employee.name}`,
        } : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/auth/refresh
 */
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token required' });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    // Check if token matches stored token
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ success: false, message: 'Refresh token revoked' });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    res.json({ success: true, accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/auth/verify-face (Mock)
 */
const verifyFace = async (req, res) => {
  try {
    // Mock: In production, this would call a Face Recognition engine
    // For now, return the latest enrolled employee as matched
    const employees = await prisma.employee.findMany({
      where: { 
        faceStatus: 'ENROLLED',
        user: { isNot: null }
      },
      include: { department: true, user: true },
      orderBy: { updatedAt: 'desc' },
      take: 1,
    });

    if (employees.length === 0) {
      return res.status(404).json({ success: false, message: 'No enrolled faces with user accounts found' });
    }

    // Simulate: pick the latest enrolled one
    const matched = employees[0];
    if (!matched.user) {
      return res.status(404).json({ success: false, message: 'Employee has no user account' });
    }

    const accessToken = generateAccessToken(matched.user);
    const refreshToken = generateRefreshToken(matched.user);

    await prisma.user.update({
      where: { id: matched.user.id },
      data: { refreshToken },
    });

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: matched.user.id,
        username: matched.user.username,
        role: matched.user.role,
        employee: {
          id: matched.id,
          name: matched.name,
          employeeCode: matched.employeeCode,
          department: matched.department.name,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${matched.name}`,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { refreshToken: null },
    });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { employee: { include: { department: true, shift: true } } },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employee: user.employee ? {
          id: user.employee.id,
          name: user.employee.name,
          employeeCode: user.employee.employeeCode,
          email: user.employee.email,
          phone: user.employee.phone,
          position: user.employee.position,
          department: user.employee.department.name,
          shift: user.employee.shift,
          faceStatus: user.employee.faceStatus,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.employee.name}`,
        } : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { login, refresh, verifyFace, logout, getMe };
