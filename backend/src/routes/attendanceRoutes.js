const router = require('express').Router();
const { getAll, checkIn, checkOut, getSummary, getHistory, importFromExcel, getImportProgress, recalculate, getMasterOptions, createManual, downloadTemplate, update } = require('../controllers/attendanceController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

router.use(verifyToken);

router.get('/', getAll);
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/summary', getSummary);
router.get('/template', downloadTemplate);
router.post('/recalculate', requireAdmin, recalculate);
router.get('/history/:empId', getHistory);
router.get('/master-options', getMasterOptions);
router.post('/import', requireAdmin, upload.single('file'), importFromExcel);
router.get('/import-progress', getImportProgress);
router.post('/manual', requireAdmin, createManual);
router.put('/:id', requireAdmin, update);

module.exports = router;
