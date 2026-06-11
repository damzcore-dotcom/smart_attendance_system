const express = require('express');
const router = express.Router();
const { verifyToken, requireDirektur } = require('../middleware/auth');
const {
  getStats,
  getAttendance,
  getLeave,
  getAttendanceOptions,
  getWeeklyTrends,
  getRecentLate,
  getDepartments
} = require('../controllers/direkturController');

// All routes require valid token + DIREKTUR/ADMIN/SUPER_ADMIN
router.use(verifyToken, requireDirektur);

// GET /api/direktur/stats — Summary statistics
router.get('/stats', getStats);

// GET /api/direktur/attendance — All attendance records (read-only)
router.get('/attendance', getAttendance);

// GET /api/direktur/leave — All leave requests (read-only)
router.get('/leave', getLeave);

// GET /api/direktur/attendance-options — dynamic organizational options based on filters
router.get('/attendance-options', getAttendanceOptions);

// GET /api/direktur/weekly-trends
router.get('/weekly-trends', getWeeklyTrends);

// GET /api/direktur/recent-late
router.get('/recent-late', getRecentLate);

// GET /api/direktur/departments — for backwards compatibility or simple list
router.get('/departments', getDepartments);

module.exports = router;
