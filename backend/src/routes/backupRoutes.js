const router = require('express').Router();
const { exportData, restoreData } = require('../controllers/backupController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);
router.use(requireAdmin); // Backup/Restore should be admin only, preferably SUPER_ADMIN in practice

router.get('/export', exportData);
router.post('/restore', restoreData);

module.exports = router;
