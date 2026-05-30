const aiAgentService = require('../services/aiAgentService');

/**
 * POST /api/chat
 * Handles user chat message with context and history
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

    // Run AI chat
    const reply = await aiAgentService.runAiChat(message, chatHistory, userContext);

    res.json({
      success: true,
      reply
    });
  } catch (error) {
    console.error('Error in chat controller:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal memproses pesan asisten AI: ' + error.message
    });
  }
};

module.exports = {
  handleChat
};
