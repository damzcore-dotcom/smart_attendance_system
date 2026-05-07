const jwt = require('jsonwebtoken');

/**
 * Verify JWT access token
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
};

/**
 * Require ADMIN or SUPER_ADMIN role
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

/**
 * Require SUPER_ADMIN role
 */
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Super Admin access required' });
  }
  next();
};

/**
 * Generate access token (15 minutes)
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, employeeId: user.employeeId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

/**
 * Generate refresh token (7 days)
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
};

/**
 * Require MANAGER role (also allows ADMIN, SUPER_ADMIN)
 */
const requireManager = (req, res, next) => {
  if (req.user.role !== 'MANAGER' && req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Manager access required' });
  }
  next();
};

/**
 * Require DIREKTUR role (read-only access to attendance & leave)
 * Also allows ADMIN and SUPER_ADMIN
 */
const requireDirektur = (req, res, next) => {
  const allowed = ['DIREKTUR', 'ADMIN', 'SUPER_ADMIN'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Direktur access required' });
  }
  next();
};

/**
 * Require ADMIN, SUPER_ADMIN, or MANAGER role
 */
const requireAdminOrManager = (req, res, next) => {
  const allowed = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
};

module.exports = { 
  verifyToken, 
  requireAdmin, 
  requireSuperAdmin, 
  requireManager, 
  requireDirektur, 
  requireAdminOrManager,
  generateAccessToken, 
  generateRefreshToken 
};
