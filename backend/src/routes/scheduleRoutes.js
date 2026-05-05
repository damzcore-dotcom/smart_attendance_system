const router = require('express').Router();
const { getAll, create, getEmployeeShift, update, remove } = require('../controllers/scheduleController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', getAll);
router.post('/', requireAdmin, create);
router.put('/:id', requireAdmin, update);
router.delete('/:id', requireAdmin, remove);
router.get('/employee/:empId', getEmployeeShift);

module.exports = router;
