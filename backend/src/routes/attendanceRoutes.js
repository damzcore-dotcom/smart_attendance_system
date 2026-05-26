const router = require('express').Router();
const { getAll, checkIn, checkOut, getSummary, getHistory, importFromExcel, getImportProgress, recalculate, swapDays, getMasterOptions, createManual, downloadTemplate, update, bulkUpdateOvertime, bulkUpdateDailyWorkers } = require('../controllers/attendanceController');
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
router.post('/swap-days', requireAdmin, swapDays);
router.get('/history/:empId', getHistory);
router.get('/master-options', getMasterOptions);
router.post('/import', requireAdmin, upload.single('file'), importFromExcel);
router.get('/import-progress', getImportProgress);
router.post('/manual', requireAdmin, createManual);
router.put('/:id', requireAdmin, update);
router.patch('/bulk-overtime', requireAdmin, bulkUpdateOvertime);
router.post('/bulk-daily-workers', requireAdmin, bulkUpdateDailyWorkers);

module.exports = router;
