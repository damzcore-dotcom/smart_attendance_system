const prisma = require('../prismaClient');
const { recordAuditLog } = require('./auditLogController');

const getAll = async (req, res) => {
  try {
    const { year, month } = req.query;
    const where = {};
    
    if (year && month) {
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0);
      where.date = { gte: startDate, lte: endDate };
    } else if (year) {
      const startDate = new Date(parseInt(year), 0, 1);
      const endDate = new Date(parseInt(year), 11, 31);
      where.date = { gte: startDate, lte: endDate };
    }

    const calendars = await prisma.companyCalendar.findMany({
      where,
      orderBy: { date: 'asc' }
    });

    res.json({ success: true, data: calendars });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const upsert = async (req, res) => {
  try {
    const { date, type, description } = req.body;
    if (!date || !type || !description) {
      return res.status(400).json({ success: false, message: 'Date, type, and description are required' });
    }

    // Pastikan date di-parsing sebagai UTC Midnight untuk menghindari Timezone Shift
    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    const calendar = await prisma.companyCalendar.upsert({
      where: { date: parsedDate },
      update: { type, description },
      create: { date: parsedDate, type, description }
    });

    if (req.user) {
      recordAuditLog({ 
        userId: req.user.id, 
        username: req.user.username, 
        role: req.user.role, 
        action: 'UPSERT', 
        entity: 'CompanyCalendar', 
        entityId: calendar.id, 
        details: { date, type, description }, 
        ipAddress: req.ip 
      });
    }

    res.json({ success: true, message: 'Calendar updated successfully', data: calendar });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.companyCalendar.delete({ where: { id: parseInt(id) } });

    if (req.user) {
      recordAuditLog({ 
        userId: req.user.id, 
        username: req.user.username, 
        role: req.user.role, 
        action: 'DELETE', 
        entity: 'CompanyCalendar', 
        entityId: parseInt(id), 
        details: {}, 
        ipAddress: req.ip 
      });
    }

    res.json({ success: true, message: 'Calendar entry deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, upsert, remove };
