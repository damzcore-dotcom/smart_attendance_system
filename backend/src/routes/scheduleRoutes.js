const router = require('express').Router();
const { getAll, create, getEmployeeShift, update, remove, getOverrides, createOverrides, deleteOverride } = require('../controllers/scheduleController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

// Overrides Routes
router.get('/overrides', getOverrides);
router.post('/overrides', requireAdmin, createOverrides);
router.delete('/overrides/:id', requireAdmin, deleteOverride);

// Standard Shift Routes
router.get('/', getAll);
router.post('/', requireAdmin, create);
router.put('/:id', requireAdmin, update);
router.delete('/:id', requireAdmin, remove);
router.get('/employee/:empId', getEmployeeShift);

module.exports = router;
