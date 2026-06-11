const router = require('express').Router();
const { getByEmployee, markAsRead } = require('../controllers/notificationController');
const { getPublicKey, registerToken } = require('../controllers/pushTokenController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/vapid-public-key', getPublicKey);
router.post('/register-token', registerToken);

router.get('/:employeeId', getByEmployee);
router.put('/:id/read', markAsRead);

module.exports = router;
