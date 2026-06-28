const router = require('express').Router();
const ctrl = require('../controllers/bhlPayrollController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);
router.use(requireAdmin);

router.get('/preview', ctrl.previewBhlPayroll);
router.get('/list', ctrl.listBhlPayrolls);
router.post('/generate', ctrl.generateBhlPayroll);
router.get('/:id', ctrl.getBhlPayrollById);
router.put('/:id/finalize', ctrl.finalizeBhlPayroll);
router.delete('/:id', ctrl.deleteBhlPayroll);
router.get('/:id/slip/:empId', ctrl.getBhlSlip);

module.exports = router;
