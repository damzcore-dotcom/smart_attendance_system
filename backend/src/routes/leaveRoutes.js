const router = require('express').Router();
const { create, getAll, getByEmployee, review, massApply, getMassLeaves, cancelLeave } = require('../controllers/leaveController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { validateId } = require('../middleware/validate');

router.use(verifyToken);

router.post('/', create);
router.get('/', requireAdmin, getAll);
router.get('/employee/:empId', validateId, getByEmployee);
router.put('/:id/cancel', validateId, cancelLeave);
router.put('/:id/review', validateId, requireAdmin, review);
router.post('/mass', requireAdmin, massApply);
router.get('/mass', requireAdmin, getMassLeaves);

module.exports = router;

