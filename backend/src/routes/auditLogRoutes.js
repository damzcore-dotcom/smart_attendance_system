const router = require('express').Router();
const { getAll, getStats } = require('../controllers/auditLogController');
const { verifyToken } = require('../middleware/auth');

// Allow SUPER_ADMIN, DIREKTUR, and MANAGER to access audit logs
const requireAuditLogAccess = (req, res, next) => {
  const allowedRoles = ['SUPER_ADMIN', 'DIREKTUR', 'MANAGER'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied: Audit log access required' });
  }
  next();
};

router.use(verifyToken);
router.use(requireAuditLogAccess);

router.get('/', getAll);
router.get('/stats', getStats);

module.exports = router;
