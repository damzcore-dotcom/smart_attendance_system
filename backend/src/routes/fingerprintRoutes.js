const router = require('express').Router();
const { 
  getDeviceDetail, 
  pushUsersToDevice, 
  pullTemplatesFromDevice, 
  deleteUserFromDevice, 
  getEmployeeTemplates, 
  getEmployeesWithFPStatus,
  linkUserToEmployee,
  startDeviceEnrollment,
  verifyAndSaveEnrollment
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
router.post('/devices/:id/users/:uid/link', requireAdmin, linkUserToEmployee);
router.post('/devices/:id/users/enroll', requireAdmin, startDeviceEnrollment);
router.post('/devices/:id/users/enroll/verify', requireAdmin, verifyAndSaveEnrollment);

module.exports = router;
