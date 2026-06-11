const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { handleControllerError } = require('../middleware/validate');

// Get all announcements
exports.getAll = async (req, res) => {
  try {
    const { activeOnly } = req.query;
    const where = activeOnly === 'true' ? { isActive: true } : {};
    
    const announcements = await prisma.announcement.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, data: announcements });
  } catch (error) {
    handleControllerError(res, error, 'announcementController.getAll');
  }
};

// Create announcement
exports.create = async (req, res) => {
  try {
    const { title, content, type, author, isActive } = req.body;
    const announcement = await prisma.announcement.create({
      data: { 
        title, 
        content, 
        type: type || 'General', 
        author: author || 'Admin',
        isActive: isActive !== undefined ? isActive : true
      }
    });
    res.status(201).json({ success: true, data: announcement });
  } catch (error) {
    handleControllerError(res, error, 'announcementController.create');
  }
};

// Update announcement
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, type, author, isActive } = req.body;
    const announcement = await prisma.announcement.update({
      where: { id: parseInt(id) },
      data: { title, content, type, author, isActive }
    });
    res.json({ success: true, data: announcement });
  } catch (error) {
    handleControllerError(res, error, 'announcementController.update');
  }
};

// Delete announcement
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.announcement.delete({
      where: { id: parseInt(id) }
    });
    res.json({ success: true, message: 'Announcement deleted successfully' });
  } catch (error) {
    handleControllerError(res, error, 'announcementController.delete');
  }
};
