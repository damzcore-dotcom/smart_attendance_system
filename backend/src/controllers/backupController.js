const prisma = require('../prismaClient');

/**
 * GET /api/backup/export
 * Export all database data to JSON
 */
const exportData = async (req, res) => {
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      data: {}
    };

    // List of models to export in order
    const models = [
      'department', 'shift', 'location', 'employee', 'user', 
      'menuPermission', 'attendance', 'correctionRequest', 
      'leaveRequest', 'announcement', 'notification', 'settings'
    ];

    for (const model of models) {
      backup.data[model] = await prisma[model].findMany();
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=backup_${new Date().toISOString().split('T')[0]}.json`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/backup/restore
 * Restore database from JSON
 */
const restoreData = async (req, res) => {
  try {
    const { backup } = req.body;

    if (!backup || !backup.data) {
      return res.status(400).json({ success: false, message: 'Invalid backup file' });
    }

    // Wrap everything in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete all existing data in REVERSE order of dependencies
      const modelsToDelete = [
        'notification', 'announcement', 'leaveRequest', 'correctionRequest', 
        'attendance', 'menuPermission', 'user', 'employee', 
        'location', 'shift', 'department', 'settings'
      ];

      for (const model of modelsToDelete) {
        await tx[model].deleteMany();
      }

      // 2. Restore data in original order
      const modelsToRestore = [
        'department', 'shift', 'location', 'employee', 'user', 
        'menuPermission', 'attendance', 'correctionRequest', 
        'leaveRequest', 'announcement', 'notification', 'settings'
      ];

      for (const model of modelsToRestore) {
        const records = backup.data[model];
        if (records && records.length > 0) {
          // Note: createMany might not work with some specific column types (like Json), 
          // so we use create in a loop if needed, but for simplicity we try createMany first.
          // However, Prisma doesn't support createMany on all databases with the same syntax.
          // For PostgreSQL, it should be fine.
          
          // Re-formatting dates for Prisma
          const formattedRecords = records.map(r => {
            const newRec = { ...r };
            // Convert ISO strings back to Date objects if the field names suggest they are dates
            Object.keys(newRec).forEach(key => {
              if (typeof newRec[key] === 'string' && (key.toLowerCase().includes('date') || key.toLowerCase().includes('at') || key.toLowerCase().includes('check'))) {
                const d = new Date(newRec[key]);
                if (!isNaN(d.getTime())) newRec[key] = d;
              }
            });
            return newRec;
          });

          await tx[model].createMany({ data: formattedRecords });
        }
      }
    });

    res.json({ success: true, message: 'Database restored successfully' });
  } catch (err) {
    console.error('Restore Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { exportData, restoreData };
