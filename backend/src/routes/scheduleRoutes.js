const router = require('express').Router();
const { getAll, create, getEmployeeShift } = require('../controllers/scheduleController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', getAll);
router.post('/', requireAdmin, create);
router.get('/employee/:empId', getEmployeeShift);

module.exports = router;
