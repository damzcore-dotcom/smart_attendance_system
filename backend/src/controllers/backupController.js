const prisma = require('../prismaClient');
const { recordAuditLog } = require('./auditLogController');

const { handleControllerError } = require('../middleware/validate');
// Unified list of models in order of dependency resolution (independents first, children later)
const models = [
  // Independent tables
  'settings',
  'department',
  'shift',
  'location',
  'announcement',
  'massLeave',
  'device',
  'camera',
  'chatLog',
  'nlpKeywordConfig',
  'companyCalendar',
  'overtimeRule',
  'salaryComponent',
  'payrollConfig',
  'auditLog',
  'payroll',

  // Tables depending on independent tables
  'employee',
  'positionAllowance',
  'unknownFaceAlert',

  // Tables depending on employee / user / payroll
  'user',
  'employeeShiftOverride',
  'employeeDocument',
  'attendance',
  'correctionRequest',
  'notification',
  'leaveRequest',
  'fingerTemplate',
  'deviceUser',
  'employeeSalary',
  'payrollDetail',
  'faceEvent',
  'reimbursementClaim',
  'profileUpdateRequest',
  'employeeKPI',
  'pushToken',

  // Tables depending on user
  'managerAccess',
  'menuPermission'
];

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

    for (const model of models) {
      if (prisma[model]) {
        backup.data[model] = await prisma[model].findMany();
      }
    }

    // Record Audit Log
    if (req.user) {
      await recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: 'EXPORT',
        entity: 'Database',
        details: `Database backup exported with ${models.length} tables`
      });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=backup_${new Date().toISOString().split('T')[0]}.json`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    handleControllerError(res, err, 'backupController');
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

    // Wrap everything in a transaction with extended timeouts for safety
    await prisma.$transaction(async (tx) => {
      // 1. Delete all existing data in REVERSE order of dependencies
      const modelsToDelete = [...models].reverse();
      console.log('Clearing database tables...');
      for (const model of modelsToDelete) {
        if (tx[model]) {
          await tx[model].deleteMany();
        }
      }

      // 2. Restore data in original order
      for (const model of models) {
        const records = backup.data[model];
        if (records && records.length > 0) {
          console.log(`Restoring ${records.length} records for model: ${model}`);
          
          const processedRecords = [];
          for (const r of records) {
            const newRec = { ...r };
            
            // Convert ISO strings back to Date objects, and Buffer objects back to Buffers
            Object.keys(newRec).forEach(key => {
              const val = newRec[key];
              if (val && typeof val === 'object' && val.type === 'Buffer' && Array.isArray(val.data)) {
                newRec[key] = Buffer.from(val.data);
              } else if (val && typeof val === 'string') {
                const lowerKey = key.toLowerCase();
                if (lowerKey.includes('date') || lowerKey.endsWith('at') || lowerKey.includes('check') || lowerKey.endsWith('end')) {
                  const d = new Date(val);
                  if (!isNaN(d.getTime())) {
                    newRec[key] = d;
                  }
                }
              }
            });

            // Remove legacy fields that might exist in old backups
            if (model === 'user' && 'managedDeptId' in newRec) {
              delete newRec.managedDeptId;
            }

            processedRecords.push(newRec);
          }

          try {
            // Write records in batches of 1000 to prevent parameter limit issues in PostgreSQL
            const BATCH_SIZE = 1000;
            for (let i = 0; i < processedRecords.length; i += BATCH_SIZE) {
              const batch = processedRecords.slice(i, i + BATCH_SIZE);
              await tx[model].createMany({ data: batch });
            }
          } catch (createErr) {
            console.error(`Error creating records in ${model}:`, createErr.message);
            throw new Error(`Failed to restore ${model}: ${createErr.message}`);
          }
        }
      }

      // 3. Reset PostgreSQL sequences to avoid ID collision
      const tablesWithSequences = models.filter(m => m !== 'camera');
      console.log('Resetting PostgreSQL sequences...');
      for (const model of tablesWithSequences) {
        try {
          // Dynamic PostgreSQL DO block to safely reset table ID sequence only if it exists
          await tx.$executeRawUnsafe(`
            DO $$
            DECLARE
                seq_name text;
            BEGIN
                seq_name := pg_get_serial_sequence('"${model}"', 'id');
                IF seq_name IS NOT NULL THEN
                    EXECUTE format('SELECT setval(%L, coalesce((SELECT max(id) FROM "${model}"), 1))', seq_name);
                END IF;
            END $$;
          `);
        } catch (seqErr) {
          console.warn(`Could not reset sequence for model ${model}:`, seqErr.message);
        }
      }
    }, {
      maxWait: 60000, // 60 seconds to wait to acquire transaction
      timeout: 300000 // 5 minutes timeout for large restores
    });

    // Record Audit Log
    if (req.user) {
      await recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: 'RESTORE',
        entity: 'Database',
        details: 'Database successfully restored from backup file'
      });
    }

    res.json({ success: true, message: 'Database restored successfully' });
  } catch (err) {
    console.error('Restore Error:', err);
    handleControllerError(res, err, 'backupController');
  }
};

module.exports = { exportData, restoreData };

