const router = require('express').Router();
const { getAll, getById, create, update, remove, importExcel, getProgress, getMasterOptions } = require('../controllers/employeeController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

router.use(verifyToken);

router.get('/import-progress', getProgress);
router.get('/master-options', getMasterOptions);
router.post('/import', requireAdmin, upload.single('file'), importExcel);

router.get('/', getAll);
router.get('/:id', getById);
router.post('/', requireAdmin, create);
router.put('/:id', requireAdmin, update);
router.delete('/:id', requireAdmin, remove);

module.exports = router;
