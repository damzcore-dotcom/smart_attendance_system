const router = require('express').Router();
const { getAll, getById, create, update, remove, importExcel, getProgress, getMasterOptions, batchUpdateShift, checkDuplicate, batchUpdateSalaryCategory, getNextFingerId, getNextNik, getContractsSummary, getContractHistory, getTrainingSummary } = require('../controllers/employeeController');
const { upload: uploadDoc, uploadDocument, getDocuments, deleteDocument, getContractAlerts } = require('../controllers/documentController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { validateId } = require('../middleware/validate');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

router.use(verifyToken);

router.get('/import-progress', getProgress);
router.get('/master-options', getMasterOptions);
router.post('/import', requireAdmin, upload.single('file'), importExcel);

router.get('/check-nik', checkDuplicate);
router.get('/next-finger-id', getNextFingerId);
router.get('/next-nik', getNextNik);
router.get('/alerts/contracts', requireAdmin, getContractAlerts);
router.get('/contracts-summary', requireAdmin, getContractsSummary);
router.get('/training-summary', requireAdmin, getTrainingSummary);
router.get('/:id/contract-history', validateId, requireAdmin, getContractHistory);
router.get('/', getAll);
router.put('/batch-shift', requireAdmin, batchUpdateShift);
router.put('/batch-salary-category', requireAdmin, batchUpdateSalaryCategory);
router.post('/:id/documents', validateId, requireAdmin, uploadDoc.single('file'), uploadDocument);
router.get('/:id/documents', validateId, getDocuments);
router.delete('/documents/:docId', validateId, requireAdmin, deleteDocument);
router.get('/:id', validateId, getById);
router.post('/', requireAdmin, create);
router.put('/:id', validateId, requireAdmin, update);
router.delete('/:id', validateId, requireAdmin, remove);

module.exports = router;

