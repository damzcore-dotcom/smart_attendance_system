const router = require('express').Router();
const { login, refresh, verifyFace, logout, getMe } = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/verify-face', verifyFace);
router.post('/logout', verifyToken, logout);
router.get('/me', verifyToken, getMe);

module.exports = router;
