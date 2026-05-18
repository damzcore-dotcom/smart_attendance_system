const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', calendarController.getAll);
router.post('/upsert', requireAdmin, calendarController.upsert);
router.delete('/:id', requireAdmin, calendarController.remove);

module.exports = router;
