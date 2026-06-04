const prisma = require('../prismaClient');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken } = require('../middleware/auth');
const { recordAuditLog } = require('./auditLogController');

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

    if (user.role === 'DIREKTUR' || user.role === 'MANAGER') {
      recordAuditLog({
        userId: user.id,
        username: user.username,
        role: user.role,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        details: { method: 'password' },
        ipAddress: req.ip
      }).catch(() => {});
    }

    res.json({
      success: true,
      accessToken,
      refreshToken,
      mustChangePassword: user.mustChangePassword || false,
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
          leaveQuota: user.employee.leaveQuota,
          remainingLeave: user.employee.remainingLeave,
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

    // Load settings for auto enrollment and threshold
    const settings = await prisma.settings.findMany({
      where: { key: { in: ['faceMatchThreshold', 'autoEnrollment'] } }
    });
    const settingsMap = {};
    settings.forEach(s => settingsMap[s.key] = s.value);

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
    const uiThreshold = parseInt(settingsMap['faceMatchThreshold']) || 85;
    // Map UI slider (50-100%) to Euclidean distance threshold (0.7 - 0.35)
    // Standard face-api.js threshold is ~0.4-0.6. Old formula was too strict (85% = 0.15).
    const clampedThreshold = Math.max(50, Math.min(100, uiThreshold));
    const THRESHOLD = 0.7 - ((clampedThreshold - 50) / 50) * 0.35; // 50%→0.7, 75%→0.525, 85%→0.455, 100%→0.35
    let minDistance = 1.0;

    for (const emp of employees) {
      try {
        const storedData = Array.isArray(emp.faceDescriptor) 
          ? emp.faceDescriptor 
          : JSON.parse(emp.faceDescriptor);
        
        if (!storedData || !Array.isArray(storedData) || storedData.length === 0) continue;

        // Support both old format (single flat array) and new format (array of arrays)
        const isMultiDescriptor = Array.isArray(storedData[0]);
        const descriptorsToTest = isMultiDescriptor ? storedData : [storedData];

        // Find the absolute closest distance among all stored descriptors for this employee
        for (const storedDesc of descriptorsToTest) {
          const distance = getDistance(descriptor, storedDesc);
          if (distance < minDistance) {
            minDistance = distance;
            bestMatch = emp;
          }
        }
      } catch (err) {
        console.error(`Failed to parse descriptor for employee ${emp.id}:`, err.message);
        continue;
      }
    }

    if (!bestMatch || minDistance > THRESHOLD) {
      if (bestMatch && minDistance <= 1.2) {
        // Log near-miss attempts
        recordAuditLog({
          userId: bestMatch.user.id,
          username: bestMatch.user.username,
          role: bestMatch.user.role,
          action: 'LOGIN_FAILED',
          entity: 'Biometric',
          entityId: bestMatch.id,
          details: { reason: 'Face distance exceeded threshold', distance: minDistance, threshold: THRESHOLD },
          ipAddress: req.ip
        }).catch(() => {});
      }
      return res.status(401).json({ success: false, message: 'Face not recognized' });
    }

    const accessToken = generateAccessToken(bestMatch.user);
    const refreshToken = generateRefreshToken(bestMatch.user);

    // Log successful face match
    recordAuditLog({
      userId: bestMatch.user.id,
      username: bestMatch.user.username,
      role: bestMatch.user.role,
      action: 'LOGIN',
      entity: 'Biometric',
      entityId: bestMatch.id,
      details: { distance: minDistance, threshold: THRESHOLD },
      ipAddress: req.ip
    }).catch(() => {});

    await prisma.user.update({
      where: { id: bestMatch.user.id },
      data: { refreshToken },
    });

    // Auto-Enrollment (Add new descriptor to the pool, max 5)
    if (settingsMap['autoEnrollment'] === 'true') {
      try {
        // Get existing descriptors
        let existingDesc = Array.isArray(bestMatch.faceDescriptor) 
          ? bestMatch.faceDescriptor 
          : JSON.parse(bestMatch.faceDescriptor);
        
        // Convert to array of arrays if it's the old single flat array format
        if (existingDesc.length > 0 && !Array.isArray(existingDesc[0])) {
          existingDesc = [existingDesc];
        }

        // Add the new high-quality descriptor
        existingDesc.push(descriptor);

        // Keep only the most recent 5 descriptors to avoid database bloat and drift
        if (existingDesc.length > 5) {
          existingDesc = existingDesc.slice(-5);
        }

        await prisma.employee.update({
          where: { id: bestMatch.id },
          data: { faceDescriptor: JSON.stringify(existingDesc) }
        });
      } catch (e) {
        console.error('Auto-enrollment update failed:', e.message);
      }
    }

    // Calculate confidence score: 100% = perfect match (distance 0), 0% = at threshold boundary
    const confidence = Math.max(0, Math.round((1 - minDistance / 0.7) * 100));

    res.json({
      success: true,
      accessToken,
      refreshToken,
      match: {
        distance: parseFloat(minDistance.toFixed(4)),
        threshold: parseFloat(THRESHOLD.toFixed(4)),
        confidence,          // 0-100%: how confident the match is
      },
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
    const userRole = req.user?.role;
    if (userRole === 'DIREKTUR' || userRole === 'MANAGER') {
      recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: 'LOGOUT',
        entity: 'User',
        entityId: req.user.id,
        details: { reason: 'user logout' },
        ipAddress: req.ip
      }).catch(() => {});
    }
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
          leaveQuota: user.employee.leaveQuota,
          remainingLeave: user.employee.remainingLeave,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.employee.name}`,
          stats: {
            lateFrequency: await prisma.attendance.count({
              where: {
                employeeId: user.employee.id,
                status: 'LATE',
                date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
              }
            }),
            totalLateMinutes: (await prisma.attendance.aggregate({
              _sum: { lateMinutes: true },
              where: {
                employeeId: user.employee.id,
                status: 'LATE',
                date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
              }
            }))._sum.lateMinutes || 0,
            recentActivity: await prisma.attendance.findMany({
              where: { employeeId: user.employee.id },
              orderBy: { date: 'desc' },
              take: 5
            })
          }
        } : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/auth/change-password
 * Force password change on first login
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new passwords are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from current password' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, mustChangePassword: false },
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { login, refresh, verifyFace, logout, getMe, changePassword };
