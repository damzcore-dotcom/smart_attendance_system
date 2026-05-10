const router = require('express').Router();
const { getAll, getStats } = require('../controllers/auditLogController');
const { verifyToken, requireSuperAdmin } = require('../middleware/auth');

router.use(verifyToken);
router.use(requireSuperAdmin);

router.get('/', getAll);
router.get('/stats', getStats);

module.exports = router;
