const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.get('/', verifyToken, requireAdmin, deviceController.getDevices);
router.get('/sync-logs', verifyToken, requireAdmin, deviceController.getDeviceSyncLogs);
router.post('/', verifyToken, requireAdmin, deviceController.addDevice);
router.put('/:id', verifyToken, requireAdmin, deviceController.updateDevice);
router.delete('/:id', verifyToken, requireAdmin, deviceController.deleteDevice);
router.post('/test-connection', verifyToken, requireAdmin, deviceController.testConnection);
router.post('/:id/sync-users', verifyToken, requireAdmin, deviceController.syncUsers);
router.post('/:id/sync-attendance', verifyToken, requireAdmin, deviceController.syncAttendance);
router.post('/:id/commit-attendance', verifyToken, requireAdmin, deviceController.commitAttendance);
router.get('/:id/stats', verifyToken, requireAdmin, deviceController.getDeviceStats);
router.post('/:id/clear-logs', verifyToken, requireAdmin, deviceController.clearDeviceLogs);

module.exports = router;
