const router = require('express').Router();
const { getByEmployee, markAsRead } = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/:employeeId', getByEmployee);
router.put('/:id/read', markAsRead);

module.exports = router;
