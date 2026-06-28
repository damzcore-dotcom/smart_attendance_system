const router = require('express').Router();
const {
  exportData, restoreData, getSchedule, updateSchedule,
  runBackupNow, downloadBackupFile, deleteBackupFile,
  browseDirectories, createFolder
} = require('../controllers/backupController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);
router.use(requireAdmin); // Backup/Restore should be admin only, preferably SUPER_ADMIN in practice

router.get('/export', exportData);
router.post('/restore', restoreData);

// Jadwal backup otomatis + backup tersimpan di server
router.get('/schedule', getSchedule);
router.put('/schedule', updateSchedule);
router.post('/run-now', runBackupNow);
router.get('/files/:name', downloadBackupFile);
router.delete('/files/:name', deleteBackupFile);

// Folder picker (jelajah & buat folder di server)
router.get('/browse', browseDirectories);
router.post('/browse-create', createFolder);

module.exports = router;
