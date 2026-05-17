const express = require('express');
const router = express.Router();
const { verifyToken: auth, requireAdmin } = require('../middleware/auth');
const configCtrl = require('../controllers/payrollConfigController');
const payrollCtrl = require('../controllers/payrollController');

// ─── Payroll Config ──────────────────────────────
router.get('/config', auth, requireAdmin, configCtrl.getConfig);
router.put('/config', auth, requireAdmin, configCtrl.updateConfig);

// ─── Salary Components ───────────────────────────
router.get('/components', auth, requireAdmin, configCtrl.getComponents);
router.post('/components', auth, requireAdmin, configCtrl.createComponent);
router.put('/components/:id', auth, requireAdmin, configCtrl.updateComponent);
router.delete('/components/:id', auth, requireAdmin, configCtrl.deleteComponent);

// ─── Overtime Rules ──────────────────────────────
router.get('/overtime-rules', auth, requireAdmin, configCtrl.getOvertimeRules);
router.post('/overtime-rules', auth, requireAdmin, configCtrl.createOvertimeRule);
router.put('/overtime-rules/:id', auth, requireAdmin, configCtrl.updateOvertimeRule);
router.delete('/overtime-rules/:id', auth, requireAdmin, configCtrl.deleteOvertimeRule);

// ─── Employee Salary ─────────────────────────────
router.get('/employee-salary', auth, requireAdmin, configCtrl.getEmployeeSalaries);
router.put('/employee-salary/batch', auth, requireAdmin, configCtrl.batchSetSalary);
router.get('/employee-salary/:empId', auth, requireAdmin, configCtrl.getEmployeeSalary);
router.put('/employee-salary/:empId', auth, requireAdmin, configCtrl.setEmployeeSalary);

// ─── PKWT Alerts ─────────────────────────────────
router.get('/pkwt-alerts', auth, requireAdmin, configCtrl.getPkwtAlerts);

// ─── Position Allowance Matrix ───────────────────
router.get('/position-allowances', auth, requireAdmin, configCtrl.getPositionAllowances);
router.get('/position-allowance-matrix', auth, requireAdmin, configCtrl.getPositionAllowanceMatrix);
router.put('/position-allowances', auth, requireAdmin, configCtrl.upsertPositionAllowance);
router.put('/position-allowances/batch', auth, requireAdmin, configCtrl.batchUpsertPositionAllowances);
router.delete('/position-allowances/:id', auth, requireAdmin, configCtrl.deletePositionAllowance);

// ─── Payroll Operations ──────────────────────────
router.get('/list', auth, requireAdmin, payrollCtrl.getAll);
router.get('/summary', auth, requireAdmin, payrollCtrl.getPayrollSummary);
router.post('/generate', auth, requireAdmin, payrollCtrl.generate);
router.get('/detail/:id', auth, requireAdmin, payrollCtrl.getById);
router.put('/:id/submit', auth, requireAdmin, payrollCtrl.submitForApproval);
router.put('/:id/approve', auth, requireAdmin, payrollCtrl.approve);
router.put('/:id/reject', auth, requireAdmin, payrollCtrl.reject);
router.put('/:id/finalize', auth, requireAdmin, payrollCtrl.finalize);
router.put('/:id/cancel', auth, requireAdmin, payrollCtrl.cancel);
router.get('/:id/export-excel', auth, requireAdmin, payrollCtrl.exportExcel);
router.get('/:id/slip/:empId', auth, requireAdmin, payrollCtrl.getSlip);

// ─── Employee Slip (own — validates ownership in controller) ─────────────────
router.get('/my-slips/:empId', auth, payrollCtrl.getMySlips);

module.exports = router;
