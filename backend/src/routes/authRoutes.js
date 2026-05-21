const router = require('express').Router();
const { login, refresh, verifyFace, logout, getMe, changePassword } = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

const rateLimit = require('express-rate-limit');

const faceVerifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per windowMs
  message: { success: false, message: 'Too many verification attempts, please try again later' }
});

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/verify-face', faceVerifyLimiter, verifyFace);
router.post('/logout', verifyToken, logout);
router.get('/me', verifyToken, getMe);
router.post('/change-password', verifyToken, changePassword);

module.exports = router;
