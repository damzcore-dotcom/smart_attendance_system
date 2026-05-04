const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);
router.use(requireAdmin);

router.get('/', userController.getAll);
router.put('/:id', userController.update);
router.delete('/:id', userController.remove);

module.exports = router;
