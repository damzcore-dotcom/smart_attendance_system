const router = require('express').Router();
const { create, getAll, review } = require('../controllers/correctionController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

router.post('/', create);
router.get('/', requireAdmin, getAll);
router.put('/:id', requireAdmin, review);

module.exports = router;
