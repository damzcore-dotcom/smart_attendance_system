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
      'leaveRequest', 'announcement', 'notification', 'settings',
      'massLeave'
    ];

    for (const model of models) {
      if (prisma[model]) {
        backup.data[model] = await prisma[model].findMany();
      }
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
        'massLeave', 'notification', 'announcement', 'leaveRequest', 'correctionRequest', 
        'attendance', 'menuPermission', 'user', 'employee', 
        'location', 'shift', 'department', 'settings'
      ];

      for (const model of modelsToDelete) {
        if (tx[model]) {
          await tx[model].deleteMany();
        }
      }

      // 2. Restore data in original order
      const modelsToRestore = [
        'department', 'shift', 'location', 'employee', 'user', 
        'menuPermission', 'attendance', 'correctionRequest', 
        'leaveRequest', 'announcement', 'notification', 'settings',
        'massLeave'
      ];

      for (const model of modelsToRestore) {
        const records = backup.data[model];
        if (records && records.length > 0) {
          console.log(`Restoring ${records.length} records for model: ${model}`);
          
          for (const r of records) {
            const newRec = { ...r };
            
            // Remove updatedAt to let Prisma handle it
            if (newRec.updatedAt) delete newRec.updatedAt;

            // Convert ISO strings back to Date objects
            Object.keys(newRec).forEach(key => {
              if (newRec[key] && typeof newRec[key] === 'string') {
                const lowerKey = key.toLowerCase();
                if (lowerKey.includes('date') || lowerKey.endsWith('at') || lowerKey.includes('check') || lowerKey.endsWith('end')) {
                  const d = new Date(newRec[key]);
                  if (!isNaN(d.getTime())) {
                    newRec[key] = d;
                  }
                }
              }
            });

            try {
              await tx[model].create({ data: newRec });
            } catch (createErr) {
              console.error(`Error creating record in ${model}:`, createErr.message);
              // Continue to next record or throw if critical
              // For now we throw to rollback transaction on any error
              throw new Error(`Failed to restore ${model}: ${createErr.message}`);
            }
          }
        }
      }
    }, {
      timeout: 30000 // Increase timeout for large restores
    });

    res.json({ success: true, message: 'Database restored successfully' });
  } catch (err) {
    console.error('Restore Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { exportData, restoreData };
