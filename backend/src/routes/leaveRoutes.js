const router = require('express').Router();
const { create, getAll, getByEmployee, review, massApply, getMassLeaves } = require('../controllers/leaveController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

router.post('/', create);
router.get('/', requireAdmin, getAll);
router.get('/employee/:empId', getByEmployee);
router.put('/:id/review', requireAdmin, review);
router.post('/mass', requireAdmin, massApply);
router.get('/mass', requireAdmin, getMassLeaves);

module.exports = router;
