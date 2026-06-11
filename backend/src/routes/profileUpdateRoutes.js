const router = require('express').Router();
const { upload, submitUpdateRequest, getUpdateRequests, reviewUpdateRequest } = require('../controllers/profileUpdateController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { validateId } = require('../middleware/validate');

router.use(verifyToken);

router.post('/', upload.single('document'), submitUpdateRequest);
router.get('/', getUpdateRequests);
router.put('/:id/review', validateId, requireAdmin, reviewUpdateRequest);

module.exports = router;

