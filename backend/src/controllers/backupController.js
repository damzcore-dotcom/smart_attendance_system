const fs = require('fs');
const path = require('path');
const prisma = require('../prismaClient');
const { recordAuditLog } = require('./auditLogController');

const { handleControllerError } = require('../middleware/validate');
const backupService = require('../utils/backupService');
// Daftar model (terurut dependensi) dipusatkan di backupService agar export, restore, dan jadwal konsisten.
const { models } = backupService;

/**
 * GET /api/backup/export
 * Export all database data to JSON
 */
const exportData = async (req, res) => {
  try {
    // Block in demo mode
    if (process.env.DEMO_MODE === 'true') {
      return res.status(403).json({
        success: false,
        message: '⚠️ Fitur Backup tidak tersedia di versi Demo. Hubungi 082124130065 untuk lisensi penuh.',
        code: 'DEMO_RESTRICTED'
      });
    }
    const backup = await backupService.createBackupObject();

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
    // Block in demo mode
    if (process.env.DEMO_MODE === 'true') {
      return res.status(403).json({
        success: false,
        message: '⚠️ Fitur Restore tidak tersedia di versi Demo. Hubungi 082124130065 untuk lisensi penuh.',
        code: 'DEMO_RESTRICTED'
      });
    }
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

/**
 * GET /api/backup/schedule
 * Konfigurasi jadwal + lokasi + daftar file backup di server
 */
const getSchedule = async (req, res) => {
  try {
    const config = await backupService.getBackupConfig();
    const location = await backupService.getBackupDir();
    const files = backupService.listBackupFiles(location);
    res.json({
      success: true,
      data: { config, location, files }
    });
  } catch (err) {
    handleControllerError(res, err, 'backupController.getSchedule');
  }
};

/**
 * PUT /api/backup/schedule
 * Simpan konfigurasi jadwal backup otomatis
 */
const updateSchedule = async (req, res) => {
  try {
    if (process.env.DEMO_MODE === 'true') {
      return res.status(403).json({ success: false, message: '⚠️ Tidak tersedia di versi Demo.', code: 'DEMO_RESTRICTED' });
    }
    let config;
    try {
      config = await backupService.saveBackupConfig(req.body || {});
    } catch (e) {
      // Validasi lokasi gagal (mis. path tidak bisa ditulis) → bad request, bukan 500.
      return res.status(400).json({ success: false, message: e.message });
    }
    if (req.user) {
      await recordAuditLog({
        userId: req.user.id, username: req.user.username, role: req.user.role,
        action: 'UPDATE', entity: 'BackupSchedule',
        details: `Jadwal backup: ${config.enabled ? 'AKTIF' : 'NONAKTIF'}, ${config.frequency} @ ${config.time}, retensi ${config.retention}`
      });
    }
    res.json({ success: true, message: 'Jadwal backup tersimpan.', data: config });
  } catch (err) {
    handleControllerError(res, err, 'backupController.updateSchedule');
  }
};

/**
 * POST /api/backup/run-now
 * Buat backup ke server (disk) sekarang juga
 */
const runBackupNow = async (req, res) => {
  try {
    if (process.env.DEMO_MODE === 'true') {
      return res.status(403).json({ success: false, message: '⚠️ Tidak tersedia di versi Demo.', code: 'DEMO_RESTRICTED' });
    }
    const result = await backupService.writeBackupToDisk('manual');
    if (req.user) {
      await recordAuditLog({
        userId: req.user.id, username: req.user.username, role: req.user.role,
        action: 'EXPORT', entity: 'Database',
        details: `Backup manual ke server: ${result.fileName}`
      });
    }
    res.json({ success: true, message: 'Backup berhasil dibuat di server.', data: result });
  } catch (err) {
    handleControllerError(res, err, 'backupController.runBackupNow');
  }
};

/**
 * GET /api/backup/files/:name
 * Unduh file backup yang tersimpan di server
 */
const downloadBackupFile = async (req, res) => {
  try {
    const dir = await backupService.getBackupDir();
    const full = backupService.resolveBackupFile(dir, req.params.name);
    if (!full) return res.status(404).json({ success: false, message: 'File backup tidak ditemukan.' });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${path.basename(full)}`);
    fs.createReadStream(full).pipe(res);
  } catch (err) {
    handleControllerError(res, err, 'backupController.downloadBackupFile');
  }
};

/**
 * DELETE /api/backup/files/:name
 * Hapus file backup di server
 */
const deleteBackupFile = async (req, res) => {
  try {
    if (process.env.DEMO_MODE === 'true') {
      return res.status(403).json({ success: false, message: '⚠️ Tidak tersedia di versi Demo.', code: 'DEMO_RESTRICTED' });
    }
    const dir = await backupService.getBackupDir();
    const full = backupService.resolveBackupFile(dir, req.params.name);
    if (!full) return res.status(404).json({ success: false, message: 'File backup tidak ditemukan.' });
    fs.unlinkSync(full);
    if (req.user) {
      await recordAuditLog({
        userId: req.user.id, username: req.user.username, role: req.user.role,
        action: 'DELETE', entity: 'Database', details: `Hapus file backup: ${path.basename(full)}`
      });
    }
    res.json({ success: true, message: 'File backup dihapus.' });
  } catch (err) {
    handleControllerError(res, err, 'backupController.deleteBackupFile');
  }
};

/**
 * GET /api/backup/browse?path=...
 * Menjelajah folder di server untuk folder picker
 */
const browseDirectories = async (req, res) => {
  try {
    const data = backupService.listDirectories(req.query.path);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: `Tidak dapat membuka folder: ${err.message}` });
  }
};

/**
 * POST /api/backup/browse-create
 * Membuat folder baru di server (dari dalam folder picker)
 */
const createFolder = async (req, res) => {
  try {
    if (process.env.DEMO_MODE === 'true') {
      return res.status(403).json({ success: false, message: '⚠️ Tidak tersedia di versi Demo.', code: 'DEMO_RESTRICTED' });
    }
    const { parent, name } = req.body || {};
    const full = backupService.createDirectory(parent, name);
    res.json({ success: true, data: { path: full } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

module.exports = { exportData, restoreData, getSchedule, updateSchedule, runBackupNow, downloadBackupFile, deleteBackupFile, browseDirectories, createFolder };

