const router = require('express').Router();
const { 
  getDeviceDetail, 
  pushUsersToDevice, 
  pullTemplatesFromDevice, 
  deleteUserFromDevice, 
  getEmployeeTemplates, 
  getEmployeesWithFPStatus 
} = require('../controllers/fingerprintController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

// Employee FP status
router.get('/employees', getEmployeesWithFPStatus);
router.get('/employees/:empId/templates', getEmployeeTemplates);

// Device operations
router.get('/devices/:id/detail', getDeviceDetail);
router.post('/devices/:id/push', requireAdmin, pushUsersToDevice);
router.post('/devices/:id/pull', requireAdmin, pullTemplatesFromDevice);
router.delete('/devices/:id/users/:uid', requireAdmin, deleteUserFromDevice);

module.exports = router;
