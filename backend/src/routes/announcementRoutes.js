const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.get('/', verifyToken, announcementController.getAll);
router.post('/', verifyToken, requireAdmin, announcementController.create);
router.put('/:id', verifyToken, requireAdmin, announcementController.update);
router.delete('/:id', verifyToken, requireAdmin, announcementController.delete);

module.exports = router;
