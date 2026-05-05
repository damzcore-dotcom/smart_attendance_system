const router = require('express').Router();
const { getAll, checkIn, checkOut, getSummary, getHistory, importFromExcel, recalculate, getMasterOptions, createManual } = require('../controllers/attendanceController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

router.use(verifyToken);

router.get('/', getAll);
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/summary', getSummary);
router.post('/recalculate', requireAdmin, recalculate);
router.get('/history/:empId', getHistory);
router.get('/master-options', getMasterOptions);
router.post('/import', requireAdmin, upload.single('file'), importFromExcel);
router.post('/manual', requireAdmin, createManual);

module.exports = router;
