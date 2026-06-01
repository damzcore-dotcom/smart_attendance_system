/**
 * Chat Routes
 * 
 * Routes for AI chatbot interaction and feedback.
 * Restricted to management roles (Admin, Manager, Accounting, Director).
 */

const router = require('express').Router();
const { handleChat, handleFeedback } = require('../controllers/chatController');
const { verifyToken } = require('../middleware/auth');

// Middleware to restrict access to Admins, Managers, Accounting, and Directors only (No standard employees)
const requireChatbotAccess = (req, res, next) => {
  const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DIREKTUR', 'ACCOUNTING'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Akses asisten AI ditolak. Fitur ini hanya untuk manajemen.' });
  }
  next();
};

// All chatbot routes require authentication and manager/admin privileges
router.use(verifyToken);
router.use(requireChatbotAccess);

router.post('/', handleChat);
router.post('/feedback', handleFeedback);

module.exports = router;
