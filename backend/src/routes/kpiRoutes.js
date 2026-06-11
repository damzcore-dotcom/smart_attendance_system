const router = require('express').Router();
const { submitEvaluation, getKPIList, reviewKPI, getKPIStats, getKpiAttendancePercentage } = require('../controllers/kpiController');
const { verifyToken, requireAdmin, requireAdminOrManager } = require('../middleware/auth');
const { validateId } = require('../middleware/validate');

router.use(verifyToken);

router.post('/', requireAdminOrManager, submitEvaluation);
router.get('/', getKPIList);
router.get('/stats', getKPIStats);
router.get('/attendance-percentage', requireAdminOrManager, getKpiAttendancePercentage);
router.put('/:id/review', validateId, requireAdmin, reviewKPI);

module.exports = router;

