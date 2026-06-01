/**
 * NLP Configuration Controller
 * 
 * Provides CRUD endpoints for admin keyword tuning and
 * chat log analytics for the local NLP chatbot engine.
 */

const prisma = require('../prismaClient');

// Valid intents for keyword configuration
const VALID_INTENTS = [
  'greeting', 'help', 'getDashboardSummaryStats', 'getEmployeesList',
  'getAttendanceLogs', 'getLeaveRequests', 'getEmployeeSalaryAndPayroll',
  'getShiftSchedules', 'getFingerprintDevicesStatus', 'getSystemAuditLogs'
];

/**
 * GET /api/nlp-config/keywords
 * List all NLP keyword configurations grouped by intent
 */
const getKeywords = async (req, res) => {
  try {
    const keywords = await prisma.nlpKeywordConfig.findMany({
      orderBy: [{ intent: 'asc' }, { weight: 'desc' }]
    });

    // Group by intent
    const grouped = {};
    keywords.forEach(kw => {
      if (!grouped[kw.intent]) {
        grouped[kw.intent] = [];
      }
      grouped[kw.intent].push(kw);
    });

    res.json({
      success: true,
      data: grouped,
      totalKeywords: keywords.length,
      validIntents: VALID_INTENTS
    });
  } catch (error) {
    console.error('Error fetching NLP keywords:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch keyword configurations.' });
  }
};

/**
 * POST /api/nlp-config/keywords
 * Add a new keyword to the NLP configuration
 * Body: { intent, keyword, weight? }
 */
const addKeyword = async (req, res) => {
  try {
    const { intent, keyword, weight } = req.body;

    if (!intent || !keyword) {
      return res.status(400).json({ success: false, message: 'Intent and keyword are required.' });
    }

    if (!VALID_INTENTS.includes(intent)) {
      return res.status(400).json({
        success: false,
        message: `Invalid intent "${intent}". Valid intents: ${VALID_INTENTS.join(', ')}`
      });
    }

    const trimmedKeyword = keyword.trim().toLowerCase();
    if (trimmedKeyword.length < 2) {
      return res.status(400).json({ success: false, message: 'Keyword must be at least 2 characters.' });
    }

    const existing = await prisma.nlpKeywordConfig.findUnique({
      where: { intent_keyword: { intent, keyword: trimmedKeyword } }
    });

    if (existing) {
      return res.status(409).json({ success: false, message: `Keyword "${trimmedKeyword}" already exists for intent "${intent}".` });
    }

    const created = await prisma.nlpKeywordConfig.create({
      data: {
        intent,
        keyword: trimmedKeyword,
        weight: weight ? parseFloat(weight) : 1.0,
        createdBy: req.user.username
      }
    });

    res.status(201).json({ success: true, data: created, message: 'Keyword added successfully.' });
  } catch (error) {
    console.error('Error adding NLP keyword:', error);
    res.status(500).json({ success: false, message: 'Failed to add keyword.' });
  }
};

/**
 * PUT /api/nlp-config/keywords/:id
 * Update keyword weight or active status
 * Body: { weight?, isActive? }
 */
const updateKeyword = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { weight, isActive } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid keyword ID.' });
    }

    const existing = await prisma.nlpKeywordConfig.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Keyword not found.' });
    }

    const updateData = {};
    if (weight !== undefined) updateData.weight = parseFloat(weight);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const updated = await prisma.nlpKeywordConfig.update({
      where: { id },
      data: updateData
    });

    res.json({ success: true, data: updated, message: 'Keyword updated successfully.' });
  } catch (error) {
    console.error('Error updating NLP keyword:', error);
    res.status(500).json({ success: false, message: 'Failed to update keyword.' });
  }
};

/**
 * DELETE /api/nlp-config/keywords/:id
 * Delete a keyword by ID
 */
const deleteKeyword = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid keyword ID.' });
    }

    const existing = await prisma.nlpKeywordConfig.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Keyword not found.' });
    }

    await prisma.nlpKeywordConfig.delete({ where: { id } });

    res.json({ success: true, message: `Keyword "${existing.keyword}" deleted from intent "${existing.intent}".` });
  } catch (error) {
    console.error('Error deleting NLP keyword:', error);
    res.status(500).json({ success: false, message: 'Failed to delete keyword.' });
  }
};

/**
 * GET /api/nlp-config/chat-logs
 * List recent chat logs with pagination and filters
 * Query params: page, limit, intent, username, feedback, startDate, endDate
 */
const getChatLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.intent) where.detectedIntent = req.query.intent;
    if (req.query.username) where.username = { contains: req.query.username, mode: 'insensitive' };
    if (req.query.feedback) where.feedback = req.query.feedback;
    if (req.query.startDate || req.query.endDate) {
      where.createdAt = {};
      if (req.query.startDate) where.createdAt.gte = new Date(req.query.startDate);
      if (req.query.endDate) where.createdAt.lte = new Date(req.query.endDate);
    }

    const [logs, total] = await Promise.all([
      prisma.chatLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.chatLog.count({ where })
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching chat logs:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chat logs.' });
  }
};

/**
 * GET /api/nlp-config/chat-stats
 * Get aggregate chatbot statistics
 */
const getChatStats = async (req, res) => {
  try {
    const [totalQueries, avgConfidence, feedbackDist, intentDist, recentLogs] = await Promise.all([
      // Total queries
      prisma.chatLog.count(),

      // Average confidence score
      prisma.chatLog.aggregate({
        _avg: { confidenceScore: true, responseTimeMs: true },
        where: { confidenceScore: { not: null } }
      }),

      // Feedback distribution
      prisma.chatLog.groupBy({
        by: ['feedback'],
        _count: { feedback: true }
      }),

      // Top intents
      prisma.chatLog.groupBy({
        by: ['detectedIntent'],
        _count: { detectedIntent: true },
        orderBy: { _count: { detectedIntent: 'desc' } },
        take: 10
      }),

      // Low-confidence queries (for improvement targets)
      prisma.chatLog.findMany({
        where: { confidenceScore: { lt: 0.5 } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          query: true,
          detectedIntent: true,
          confidenceScore: true,
          feedback: true,
          createdAt: true
        }
      })
    ]);

    // Process feedback distribution
    const feedback = {
      positive: 0,
      negative: 0,
      none: 0
    };
    feedbackDist.forEach(item => {
      if (item.feedback === 'positive') feedback.positive = item._count.feedback;
      else if (item.feedback === 'negative') feedback.negative = item._count.feedback;
      else feedback.none = item._count.feedback;
    });

    res.json({
      success: true,
      data: {
        totalQueries,
        avgConfidenceScore: avgConfidence._avg.confidenceScore
          ? parseFloat(avgConfidence._avg.confidenceScore.toFixed(3))
          : null,
        avgResponseTimeMs: avgConfidence._avg.responseTimeMs
          ? Math.round(avgConfidence._avg.responseTimeMs)
          : null,
        feedbackDistribution: feedback,
        topIntents: intentDist.map(i => ({
          intent: i.detectedIntent || 'unknown',
          count: i._count.detectedIntent
        })),
        lowConfidenceQueries: recentLogs
      }
    });
  } catch (error) {
    console.error('Error fetching chat stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chat statistics.' });
  }
};

module.exports = {
  getKeywords,
  addKeyword,
  updateKeyword,
  deleteKeyword,
  getChatLogs,
  getChatStats
};
