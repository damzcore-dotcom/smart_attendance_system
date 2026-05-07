const express = require('express');
const router = express.Router();
const managerController = require('../controllers/managerController');
const { verifyToken, requireManager } = require('../middleware/auth');

// All manager routes require MANAGER role
router.use(verifyToken);
router.use(requireManager);

router.get('/dashboard', managerController.getDashboard);
router.get('/attendance', managerController.getAttendance);
router.get('/attendance-options', managerController.getAttendanceOptions);
router.get('/leave-requests', managerController.getLeaveRequests);
router.put('/leave-requests/:id', managerController.updateLeaveRequest);

module.exports = router;
