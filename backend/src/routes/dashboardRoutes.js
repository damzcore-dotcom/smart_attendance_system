const router = require('express').Router();
const { getStats, getWeeklyTrends, getDeptLateness, getRecentLate, getAdminNotifications } = require('../controllers/dashboardController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken, requireAdmin);

router.get('/stats', getStats);
router.get('/weekly-trends', getWeeklyTrends);
router.get('/dept-lateness', getDeptLateness);
router.get('/recent-late', getRecentLate);
router.get('/notifications', getAdminNotifications);

module.exports = router;
