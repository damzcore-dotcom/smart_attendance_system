const router = require('express').Router();
const { getAll, checkIn, checkOut, getSummary, getHistory, importFromExcel, getImportProgress, recalculate, swapDays, getMasterOptions, createManual, downloadTemplate, update, bulkUpdateOvertime, bulkUpdateDailyWorkers, manualCorrectionHRD, getOvertimeSummary, getBhlSummary, getCorrectionHistory, materializeAbsences } = require('../controllers/attendanceController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.xlsx', '.xls', '.csv'];
    if (!allowed.includes(ext)) {
      return cb(new Error('Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed.'));
    }
    cb(null, true);
  }
});

router.use(verifyToken);

router.get('/', getAll);
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/summary', getSummary);
router.get('/template', downloadTemplate);
router.get('/overtime-summary', requireAdmin, getOvertimeSummary);
router.get('/bhl-summary', requireAdmin, getBhlSummary);
router.get('/correction-history', requireAdmin, getCorrectionHistory);
router.post('/recalculate', requireAdmin, recalculate);
router.post('/materialize-absences', requireAdmin, materializeAbsences);
router.post('/swap-days', requireAdmin, swapDays);
router.get('/history/:empId', getHistory);
router.get('/master-options', getMasterOptions);
router.post('/import', requireAdmin, upload.single('file'), importFromExcel);
router.get('/import-progress', getImportProgress);
router.post('/manual', requireAdmin, createManual);
router.put('/:id', requireAdmin, update);
router.patch('/bulk-overtime', requireAdmin, bulkUpdateOvertime);
router.post('/bulk-daily-workers', requireAdmin, bulkUpdateDailyWorkers);
router.post('/manual-correction', requireAdmin, manualCorrectionHRD);

module.exports = router;
