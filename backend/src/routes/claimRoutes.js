const router = require('express').Router();
const { upload, createClaim, getClaims, reviewClaim, deleteClaim } = require('../controllers/claimController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { validateId } = require('../middleware/validate');

router.use(verifyToken);

router.post('/', upload.single('receipt'), createClaim);
router.get('/', getClaims);
router.put('/:id/review', validateId, requireAdmin, reviewClaim);
router.delete('/:id', validateId, deleteClaim);

module.exports = router;

