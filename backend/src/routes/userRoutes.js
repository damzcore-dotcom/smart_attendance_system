const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);
router.use(requireAdmin);

router.get('/', userController.getAll);
router.get('/employee-options', userController.getEmployeeOptions);
router.get('/department-options', userController.getDepartmentOptions);
router.post('/', userController.create);
router.put('/:id', userController.update);
router.put('/:id/biometrics', userController.updateBiometrics);
router.get('/:id/permissions', userController.getPermissions);
router.put('/:id/permissions', userController.updatePermissions);
router.delete('/:id', userController.remove);

module.exports = router;
