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
      include: { 
        employee: { include: { department: true } },
        permissions: true
      },
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
        permissions: user.role === 'SUPER_ADMIN' ? 'ALL' : user.permissions,
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
 * Euclidean distance for face descriptors
 */
const getDistance = (arr1, arr2) => {
  return Math.sqrt(arr1.reduce((acc, val, i) => acc + Math.pow(val - arr2[i], 2), 0));
};

/**
 * POST /api/auth/verify-face
 */
const verifyFace = async (req, res) => {
  try {
    let { descriptor } = req.body; 
    
    // If sent as string, parse it
    if (typeof descriptor === 'string') {
      try {
        descriptor = JSON.parse(descriptor);
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid descriptor format' });
      }
    }
    
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length === 0) {
      console.error('Verify-face failed: descriptor is not an array', typeof descriptor);
      return res.status(400).json({ success: false, message: 'Biometric descriptor is required and must be an array' });
    }

    // Fetch all employees with enrolled faces and valid users
    const employees = await prisma.employee.findMany({
      where: { 
        faceStatus: 'ENROLLED',
        faceDescriptor: { not: null },
        user: { isNot: null }
      },
      include: { 
        department: true, 
        user: { include: { permissions: true } } 
      },
    });

    if (employees.length === 0) {
      return res.status(404).json({ success: false, message: 'No registered face accounts found' });
    }

    // Match the closest face
    let bestMatch = null;
    let minDistance = 1.0; // face-api threshold is usually 0.6
    const THRESHOLD = 0.6;

    for (const emp of employees) {
      try {
        const storedDescriptor = Array.isArray(emp.faceDescriptor) 
          ? emp.faceDescriptor 
          : JSON.parse(emp.faceDescriptor);
        
        if (!storedDescriptor || !Array.isArray(storedDescriptor)) continue;

        const distance = getDistance(descriptor, storedDescriptor);
        if (distance < minDistance) {
          minDistance = distance;
          bestMatch = emp;
        }
      } catch (err) {
        console.error(`Failed to parse descriptor for employee ${emp.id}:`, err.message);
        continue;
      }
    }

    if (!bestMatch || minDistance > THRESHOLD) {
      return res.status(401).json({ success: false, message: 'Face not recognized' });
    }

    const accessToken = generateAccessToken(bestMatch.user);
    const refreshToken = generateRefreshToken(bestMatch.user);

    await prisma.user.update({
      where: { id: bestMatch.user.id },
      data: { refreshToken },
    });

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: bestMatch.user.id,
        username: bestMatch.user.username,
        role: bestMatch.user.role,
        permissions: bestMatch.user.role === 'SUPER_ADMIN' ? 'ALL' : bestMatch.user.permissions,
        employee: {
          id: bestMatch.id,
          name: bestMatch.name,
          employeeCode: bestMatch.employeeCode,
          department: bestMatch.department.name,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${bestMatch.name}`,
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
      include: { 
        employee: { include: { department: true, shift: true } },
        permissions: true
      },
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
        permissions: user.role === 'SUPER_ADMIN' ? 'ALL' : user.permissions,
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
