const router = require('express').Router();
const { create, getAll, review, getByEmployee } = require('../controllers/correctionController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

router.post('/', create);
router.get('/employee/:empId', getByEmployee);
router.get('/', requireAdmin, getAll);
router.put('/:id', requireAdmin, review);

module.exports = router;
