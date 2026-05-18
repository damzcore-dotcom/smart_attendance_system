const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/', calendarController.getAll);
router.post('/upsert', isAdmin, calendarController.upsert);
router.delete('/:id', isAdmin, calendarController.remove);

module.exports = router;
