/**
 * Chat Controller
 * 
 * Handles user chat messages, routes to AI agent service,
 * logs all interactions to ChatLog table, and provides
 * user feedback (👍/👎) endpoint.
 */

const aiAgentService = require('../services/aiAgentService');
const prisma = require('../prismaClient');
const { handleControllerError } = require('../middleware/validate');

/**
 * POST /api/chat
 * Handles user chat message with context and history.
 * Logs every interaction to the ChatLog table for analytics.
 */
const handleChat = async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const chatHistory = history || [];
    
    // Inject logged-in user context
    const userContext = {
      username: req.user.username,
      role: req.user.role,
      employeeId: req.user.employeeId
    };

    console.log(`🤖 User ${req.user.username} (${req.user.role}) sent a message to the AI Assistant.`);

    // Track response time
    const startTime = Date.now();

    // Run AI chat — returns { reply, intent, confidenceScore } or just string
    const result = await aiAgentService.runAiChat(message, chatHistory, userContext);
    
    const responseTimeMs = Date.now() - startTime;
    
    // Extract structured result if available
    const reply = typeof result === 'object' ? result.reply : result;
    const detectedIntent = typeof result === 'object' ? result.intent : null;
    const confidenceScore = typeof result === 'object' ? result.confidenceScore : null;
    const mode = process.env.CHATBOT_MODE || 'local';

    // Log to ChatLog table (non-blocking)
    let chatLogId = null;
    try {
      const logEntry = await prisma.chatLog.create({
        data: {
          username: userContext.username,
          userRole: userContext.role,
          query: message,
          detectedIntent,
          confidenceScore,
          response: typeof reply === 'string' ? reply.substring(0, 5000) : null, // Limit stored response
          responseTimeMs,
          mode
        }
      });
      chatLogId = logEntry.id;
    } catch (logError) {
      console.error('⚠️ Failed to log chat interaction (non-critical):', logError.message);
    }

    res.json({
      success: true,
      reply,
      chatLogId // Frontend can use this ID to submit feedback
    });
  } catch (error) {
    handleControllerError(res, error, 'chatController.handleChat');
  }
};

/**
 * POST /api/chat/feedback
 * Submit user feedback (👍/👎) for a specific chat interaction.
 * Body: { chatLogId, feedback: 'positive'|'negative', note? }
 */
const handleFeedback = async (req, res) => {
  try {
    const { chatLogId, feedback, note } = req.body;

    if (!chatLogId || !feedback) {
      return res.status(400).json({ success: false, message: 'chatLogId and feedback are required.' });
    }

    if (!['positive', 'negative'].includes(feedback)) {
      return res.status(400).json({ success: false, message: 'Feedback must be "positive" or "negative".' });
    }

    const logEntry = await prisma.chatLog.findUnique({ where: { id: parseInt(chatLogId, 10) } });
    if (!logEntry) {
      return res.status(404).json({ success: false, message: 'Chat log entry not found.' });
    }

    // Verify the feedback belongs to the requesting user
    if (logEntry.username !== req.user.username) {
      return res.status(403).json({ success: false, message: 'You can only provide feedback on your own chat interactions.' });
    }

    const updated = await prisma.chatLog.update({
      where: { id: parseInt(chatLogId, 10) },
      data: {
        feedback,
        feedbackNote: note || null
      }
    });

    res.json({
      success: true,
      message: feedback === 'positive' ? '👍 Terima kasih atas feedback positifnya!' : '👎 Terima kasih, kami akan berusaha memperbaiki.',
      data: { id: updated.id, feedback: updated.feedback }
    });
  } catch (error) {
    handleControllerError(res, error, 'chatController.handleFeedback');
  }
};

module.exports = {
  handleChat,
  handleFeedback
};
