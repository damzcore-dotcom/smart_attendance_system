const express = require('express');
const router = express.Router();
const { verifyToken: auth } = require('../middleware/auth');
const configCtrl = require('../controllers/payrollConfigController');
const payrollCtrl = require('../controllers/payrollController');

// ─── Payroll Config ──────────────────────────────
router.get('/config', auth, configCtrl.getConfig);
router.put('/config', auth, configCtrl.updateConfig);

// ─── Salary Components ───────────────────────────
router.get('/components', auth, configCtrl.getComponents);
router.post('/components', auth, configCtrl.createComponent);
router.put('/components/:id', auth, configCtrl.updateComponent);
router.delete('/components/:id', auth, configCtrl.deleteComponent);

// ─── Overtime Rules ──────────────────────────────
router.get('/overtime-rules', auth, configCtrl.getOvertimeRules);
router.post('/overtime-rules', auth, configCtrl.createOvertimeRule);
router.put('/overtime-rules/:id', auth, configCtrl.updateOvertimeRule);
router.delete('/overtime-rules/:id', auth, configCtrl.deleteOvertimeRule);

// ─── Employee Salary ─────────────────────────────
router.get('/employee-salary', auth, configCtrl.getEmployeeSalaries);
router.put('/employee-salary/batch', auth, configCtrl.batchSetSalary);
router.get('/employee-salary/:empId', auth, configCtrl.getEmployeeSalary);
router.put('/employee-salary/:empId', auth, configCtrl.setEmployeeSalary);

// ─── PKWT Alerts ─────────────────────────────────
router.get('/pkwt-alerts', auth, configCtrl.getPkwtAlerts);

// ─── Position Allowance Matrix ───────────────────
router.get('/position-allowances', auth, configCtrl.getPositionAllowances);
router.get('/position-allowance-matrix', auth, configCtrl.getPositionAllowanceMatrix);
router.put('/position-allowances', auth, configCtrl.upsertPositionAllowance);
router.put('/position-allowances/batch', auth, configCtrl.batchUpsertPositionAllowances);
router.delete('/position-allowances/:id', auth, configCtrl.deletePositionAllowance);

// ─── Payroll Operations ──────────────────────────
router.get('/list', auth, payrollCtrl.getAll);
router.get('/summary', auth, payrollCtrl.getPayrollSummary);
router.post('/generate', auth, payrollCtrl.generate);
router.get('/detail/:id', auth, payrollCtrl.getById);
router.put('/:id/submit', auth, payrollCtrl.submitForApproval);
router.put('/:id/approve', auth, payrollCtrl.approve);
router.put('/:id/reject', auth, payrollCtrl.reject);
router.put('/:id/finalize', auth, payrollCtrl.finalize);
router.put('/:id/cancel', auth, payrollCtrl.cancel);
router.get('/:id/export-excel', auth, payrollCtrl.exportExcel);
router.get('/:id/slip/:empId', auth, payrollCtrl.getSlip);

// ─── Employee Slip (own) ─────────────────────────
router.get('/my-slips/:empId', auth, payrollCtrl.getMySlips);

module.exports = router;
