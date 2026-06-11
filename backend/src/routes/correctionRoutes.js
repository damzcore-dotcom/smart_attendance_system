const router = require('express').Router();
const { create, getAll, review, getByEmployee } = require('../controllers/correctionController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { validateId } = require('../middleware/validate');

router.use(verifyToken);

router.post('/', create);
router.get('/employee/:empId', validateId, getByEmployee);
router.get('/', requireAdmin, getAll);
router.put('/:id', validateId, requireAdmin, review);

module.exports = router;

