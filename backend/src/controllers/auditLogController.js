const prisma = require('../prismaClient');

/**
 * Utility: Record an audit log entry
 * Called from other controllers or middleware to log admin actions
 */
const recordAuditLog = async ({ userId, username, role, action, entity, entityId, details, ipAddress }) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        username,
        role,
        action,
        entity,
        entityId: entityId || null,
        details: typeof details === 'object' ? JSON.stringify(details) : (details || null),
        ipAddress: ipAddress || null,
      }
    });
  } catch (err) {
    console.error('AuditLog recording error:', err.message);
  }
};

/**
 * GET /api/audit-logs
 * Super Admin only — fetch paginated audit logs with optional filters
 */
const getAll = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, entity, username, startDate, endDate } = req.query;

    const where = {};

    if (action && action !== 'All') where.action = action;
    if (entity && entity !== 'All') where.entity = entity;
    if (username) where.username = { contains: username, mode: 'insensitive' };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      })
    ]);

    res.json({
      success: true,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: logs.map(log => ({
        id: log.id,
        userId: log.userId,
        username: log.username,
        role: log.role,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        details: log.details,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt.toISOString(),
      }))
    });
  } catch (err) {
    console.error('AuditLog getAll error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/audit-logs/stats
 * Quick summary stats for the audit dashboard
 */
const getStats = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const [totalLogs, todayLogs, weekLogs, uniqueAdmins] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.auditLog.groupBy({ by: ['username'], _count: true }),
    ]);

    // Action breakdown
    const actionBreakdown = await prisma.auditLog.groupBy({
      by: ['action'],
      _count: true,
      orderBy: { _count: { action: 'desc' } },
    });

    res.json({
      success: true,
      data: {
        totalLogs,
        todayLogs,
        weekLogs,
        uniqueAdmins: uniqueAdmins.length,
        actionBreakdown: actionBreakdown.map(a => ({ action: a.action, count: a._count })),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getStats, recordAuditLog };
