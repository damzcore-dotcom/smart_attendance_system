const router = require('express').Router();
const { getStats, getWeeklyTrends, getDeptLateness, getRecentLate, getAdminNotifications } = require('../controllers/dashboardController');
const { verifyToken, requireAdmin, requireAdminOrManager } = require('../middleware/auth');

router.use(verifyToken);

router.get('/stats', requireAdmin, getStats);
router.get('/weekly-trends', requireAdmin, getWeeklyTrends);
router.get('/dept-lateness', requireAdmin, getDeptLateness);
router.get('/recent-late', requireAdminOrManager, getRecentLate);
router.get('/notifications', requireAdminOrManager, getAdminNotifications);

module.exports = router;
