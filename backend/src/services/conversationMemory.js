/**
 * Conversation Memory Service
 * 
 * Manages per-user session memory for the local NLP chatbot,
 * storing recent messages, detected intents, and extracted entities
 * to support multi-turn conversations and anaphora resolution.
 */

const memoryStore = new Map();
const MAX_HISTORY = 10;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Get full conversation history for a user
 * @param {string} username 
 * @returns {Array} List of chat messages
 */
const getHistory = (username) => {
  if (!memoryStore.has(username)) {
    memoryStore.set(username, { messages: [], lastActivity: Date.now() });
  }
  const session = memoryStore.get(username);
  session.lastActivity = Date.now();
  return session.messages;
};

/**
 * Get the last user turn in the conversation
 * @param {string} username 
 * @returns {Object|null} Last user message turn details
 */
const getLastTurn = (username) => {
  const history = getHistory(username);
  if (history.length === 0) return null;
  
  // Find the last user turn that resolved successfully
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') {
      return history[i];
    }
  }
  return null;
};

/**
 * Get the last resolved entities from conversation context.
 * Looks through recent turns to find the most recent entities
 * (employeeName, department, date, etc.) that were successfully resolved.
 * 
 * @param {string} username 
 * @returns {Object} Merged entities from recent turns { employeeName, department, date, startDate, endDate, period, intent }
 */
const getLastEntities = (username) => {
  const history = getHistory(username);
  const result = {
    employeeName: null,
    department: null,
    date: null,
    startDate: null,
    endDate: null,
    period: null,
    intent: null,
    status: null,
    employmentType: null
  };

  // Walk backwards through user messages to find most recent entities
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role === 'user' && turn.params) {
      // Fill in only the first (most recent) non-null value for each entity
      if (!result.employeeName && turn.params.employeeName) result.employeeName = turn.params.employeeName;
      if (!result.department && turn.params.department) result.department = turn.params.department;
      if (!result.date && turn.params.date) result.date = turn.params.date;
      if (!result.startDate && turn.params.startDate) result.startDate = turn.params.startDate;
      if (!result.endDate && turn.params.endDate) result.endDate = turn.params.endDate;
      if (!result.period && turn.params.period) result.period = turn.params.period;
      if (!result.intent && turn.intent) result.intent = turn.intent;
      if (!result.status && turn.params.status) result.status = turn.params.status;
      if (!result.employmentType && turn.params.employmentType) result.employmentType = turn.params.employmentType;

      // Stop once we have an employee name or department (most important context)
      if (result.employeeName && result.department) break;
    }
  }

  return result;
};

/**
 * Add a message to the user session memory
 * @param {string} username 
 * @param {string} role 'user' | 'model'
 * @param {string} text 
 * @param {string} intent Detected intent (only for user messages)
 * @param {Object} params Extracted entities (employeeName, department, dates, etc.)
 */
const addMessage = (username, role, text, intent = null, params = {}) => {
  const history = getHistory(username);
  
  history.push({
    role,
    text,
    intent,
    params,
    timestamp: new Date()
  });

  // Keep it within max limit
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
};

/**
 * Reset conversation memory for a user
 * @param {string} username 
 */
const clearMemory = (username) => {
  memoryStore.delete(username);
};

/**
 * Cleanup stale sessions that exceeded TTL
 * Called periodically to prevent memory leaks
 */
const cleanupStaleSessions = () => {
  const now = Date.now();
  for (const [username, session] of memoryStore.entries()) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      memoryStore.delete(username);
    }
  }
};

// Auto-cleanup every 10 minutes
setInterval(cleanupStaleSessions, 10 * 60 * 1000);

module.exports = {
  getHistory,
  getLastTurn,
  getLastEntities,
  addMessage,
  clearMemory,
  cleanupStaleSessions
};
