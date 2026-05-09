const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.get('/', verifyToken, requireAdmin, deviceController.getDevices);
router.post('/', verifyToken, requireAdmin, deviceController.addDevice);
router.delete('/:id', verifyToken, requireAdmin, deviceController.deleteDevice);
router.post('/test-connection', verifyToken, requireAdmin, deviceController.testConnection);
router.post('/:id/sync-users', verifyToken, requireAdmin, deviceController.syncUsers);
router.post('/:id/sync-attendance', verifyToken, requireAdmin, deviceController.syncAttendance);

module.exports = router;
