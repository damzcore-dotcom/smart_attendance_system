/**
 * NLP Configuration Routes
 * 
 * Admin-only endpoints for managing chatbot keywords and reviewing chat logs.
 * Restricted to SUPER_ADMIN and ADMIN roles.
 */

const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const controller = require('../controllers/nlpConfigController');

// Restrict to SUPER_ADMIN and ADMIN only
const requireAdmin = (req, res, next) => {
  if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access restricted to administrators only.' });
  }
  next();
};

router.use(verifyToken);
router.use(requireAdmin);

// Keyword management
router.get('/keywords', controller.getKeywords);
router.post('/keywords', controller.addKeyword);
router.put('/keywords/:id', controller.updateKeyword);
router.delete('/keywords/:id', controller.deleteKeyword);

// Chat log analytics
router.get('/chat-logs', controller.getChatLogs);
router.get('/chat-stats', controller.getChatStats);

module.exports = router;
