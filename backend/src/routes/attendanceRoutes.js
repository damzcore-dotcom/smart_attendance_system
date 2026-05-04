const router = require('express').Router();
const { getAll, checkIn, checkOut, getSummary, getHistory } = require('../controllers/attendanceController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', getAll);
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/summary', getSummary);
router.get('/history/:empId', getHistory);

module.exports = router;
