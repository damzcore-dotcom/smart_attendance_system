const fs = require('fs');
const path = require('path');
const prisma = require('../prismaClient');

// Lokasi default penyimpanan backup (folder "backups" pada root backend).
// Lokasi ini dapat diubah admin lewat Settings (key: backup_location).
const DEFAULT_BACKUP_DIR = path.join(process.cwd(), 'backups');

// Daftar model terurut berdasarkan dependensi (independen dulu, anak belakangan).
const models = [
  'settings', 'department', 'shift', 'location', 'announcement', 'massLeave',
  'device', 'camera', 'chatLog', 'nlpKeywordConfig', 'companyCalendar',
  'overtimeRule', 'salaryComponent', 'payrollConfig', 'auditLog', 'payroll',
  'employee', 'positionAllowance', 'unknownFaceAlert',
  'user', 'employeeShiftOverride', 'employeeDocument', 'attendance',
  'correctionRequest', 'notification', 'leaveRequest', 'fingerTemplate',
  'deviceUser', 'employeeSalary', 'payrollDetail', 'faceEvent',
  'reimbursementClaim', 'profileUpdateRequest', 'employeeKPI', 'pushToken',
  'managerAccess', 'menuPermission'
];

const DEFAULT_CONFIG = {
  enabled: false,
  frequency: 'daily',   // 'daily' | 'weekly'
  time: '02:00',        // HH:MM (24 jam)
  weekday: 1,           // 0=Minggu … 6=Sabtu (dipakai saat frequency='weekly')
  retention: 7,         // jumlah file backup yang disimpan
};

/** Lokasi backup efektif: custom dari Settings bila valid, jika tidak pakai default. */
async function getBackupDir() {
  let dir = DEFAULT_BACKUP_DIR;
  try {
    const row = await prisma.settings.findUnique({ where: { key: 'backup_location' } });
    if (row && row.value && row.value.trim()) dir = path.resolve(row.value.trim());
  } catch { /* pakai default */ }
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Lokasi custom bermasalah → jatuh ke default agar fitur tetap jalan.
    dir = DEFAULT_BACKUP_DIR;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Membangun objek backup lengkap dari seluruh tabel. */
async function createBackupObject() {
  const backup = { timestamp: new Date().toISOString(), version: '1.0', data: {} };
  for (const model of models) {
    if (prisma[model]) backup.data[model] = await prisma[model].findMany();
  }
  return backup;
}

function timestampForName(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/** Menulis snapshot backup ke disk lalu memangkas file lama sesuai retensi. */
async function writeBackupToDisk(reason = 'manual') {
  const dir = await getBackupDir();
  const backup = await createBackupObject();
  const fileName = `backup_${timestampForName()}.json`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(backup, null, 2));
  const stat = fs.statSync(filePath);

  const cfg = await getBackupConfig();
  pruneOldBackups(dir, cfg.retention);

  return { fileName, size: stat.size, createdAt: stat.mtime, reason, location: dir };
}

/** Daftar file backup pada direktori tertentu, terbaru lebih dulu. */
function listBackupFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^backup_.*\.json$/.test(f))
    .map(f => {
      const st = fs.statSync(path.join(dir, f));
      return { name: f, size: st.size, createdAt: st.mtime };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/** Menyisakan N file terbaru, menghapus selebihnya. */
function pruneOldBackups(dir, retention = DEFAULT_CONFIG.retention) {
  const keep = Math.max(1, parseInt(retention) || DEFAULT_CONFIG.retention);
  const files = listBackupFiles(dir);
  files.slice(keep).forEach(f => {
    try { fs.unlinkSync(path.join(dir, f.name)); } catch { /* abaikan */ }
  });
}

/** Memvalidasi & menyelesaikan path file backup agar aman dari path traversal. */
function resolveBackupFile(dir, name) {
  const safe = path.basename(String(name || ''));
  if (!/^backup_.*\.json$/.test(safe)) return null;
  const full = path.join(dir, safe);
  if (!full.startsWith(dir)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

/** Membaca konfigurasi jadwal backup dari tabel Settings (dengan default). */
async function getBackupConfig() {
  const keys = ['backup_auto_enabled', 'backup_frequency', 'backup_time', 'backup_weekday', 'backup_retention', 'backup_last_run', 'backup_location'];
  const rows = await prisma.settings.findMany({ where: { key: { in: keys } } });
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return {
    enabled: map.backup_auto_enabled === 'true',
    frequency: map.backup_frequency === 'weekly' ? 'weekly' : 'daily',
    time: map.backup_time || DEFAULT_CONFIG.time,
    weekday: map.backup_weekday !== undefined ? parseInt(map.backup_weekday) : DEFAULT_CONFIG.weekday,
    retention: map.backup_retention !== undefined ? parseInt(map.backup_retention) : DEFAULT_CONFIG.retention,
    lastRun: map.backup_last_run || null,
    customLocation: (map.backup_location || '').trim(),
    defaultLocation: DEFAULT_BACKUP_DIR,
  };
}

/** Menjelajah direktori di filesystem server (untuk folder picker). */
function listDirectories(targetPath) {
  const isWin = process.platform === 'win32';

  // Root: tampilkan daftar drive (Windows) atau '/' (Linux/Mac).
  if (!targetPath || targetPath === 'root') {
    if (isWin) {
      const drives = [];
      for (let c = 65; c <= 90; c++) {
        const d = `${String.fromCharCode(c)}:\\`;
        try { if (fs.existsSync(d)) drives.push(d); } catch { /* skip */ }
      }
      return { current: '', parent: null, isRoot: true, folders: drives.map(d => ({ name: d, path: d })) };
    }
    targetPath = '/';
  }

  const resolved = path.resolve(targetPath);
  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  const folders = [];
  for (const e of entries) {
    let isDir = false;
    try { isDir = e.isDirectory(); } catch { isDir = false; }
    if (isDir) folders.push({ name: e.name, path: path.join(resolved, e.name) });
  }
  folders.sort((a, b) => a.name.localeCompare(b.name));

  const parentDir = path.dirname(resolved);
  const atDriveRoot = parentDir === resolved; // mis. "C:\" atau "/"
  return {
    current: resolved,
    parent: atDriveRoot ? (isWin ? 'root' : null) : parentDir,
    isRoot: false,
    folders,
  };
}

/** Membuat folder baru di bawah sebuah direktori (untuk tombol "Folder baru" pada picker). */
function createDirectory(parent, name) {
  const safeName = String(name || '').trim();
  if (!safeName || /[<>:"/\\|?*\x00-\x1F]/.test(safeName)) {
    throw new Error('Nama folder tidak valid.');
  }
  const full = path.join(path.resolve(parent), safeName);
  fs.mkdirSync(full, { recursive: true });
  return full;
}

/** Validasi sebuah path lokasi backup: buat folder + uji tulis. Melempar error bila gagal. */
function validateBackupLocation(loc) {
  const resolved = path.resolve(loc);
  fs.mkdirSync(resolved, { recursive: true });
  const testFile = path.join(resolved, `.write_test_${Date.now()}`);
  fs.writeFileSync(testFile, 'ok');
  fs.unlinkSync(testFile);
  return resolved;
}

/** Menyimpan konfigurasi jadwal backup (termasuk lokasi) ke tabel Settings. */
async function saveBackupConfig(cfg = {}) {
  // Lokasi penyimpanan (opsional). Kosong = pakai lokasi default.
  if (cfg.location !== undefined) {
    const loc = String(cfg.location).trim();
    let valueToStore = '';
    if (loc) {
      try {
        valueToStore = validateBackupLocation(loc);
      } catch (e) {
        throw new Error(`Lokasi backup tidak dapat digunakan: ${e.message}`);
      }
    }
    await prisma.settings.upsert({
      where: { key: 'backup_location' },
      update: { value: valueToStore },
      create: { key: 'backup_location', value: valueToStore },
    });
  }

  const entries = {
    backup_auto_enabled: cfg.enabled ? 'true' : 'false',
    backup_frequency: cfg.frequency === 'weekly' ? 'weekly' : 'daily',
    backup_time: /^\d{2}:\d{2}$/.test(cfg.time) ? cfg.time : DEFAULT_CONFIG.time,
    backup_weekday: String(Number.isInteger(parseInt(cfg.weekday)) ? parseInt(cfg.weekday) : DEFAULT_CONFIG.weekday),
    backup_retention: String(Math.max(1, parseInt(cfg.retention) || DEFAULT_CONFIG.retention)),
  };
  for (const [key, value] of Object.entries(entries)) {
    await prisma.settings.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return getBackupConfig();
}

let lastTickStamp = null; // mencegah backup ganda dalam menit yang sama

/** Dipanggil cron tiap menit: menulis backup bila jadwal cocok. */
async function runScheduledBackupIfDue(now = new Date()) {
  const cfg = await getBackupConfig();
  if (!cfg.enabled) return null;

  const pad = (n) => String(n).padStart(2, '0');
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (currentTime !== cfg.time) return null;
  if (cfg.frequency === 'weekly' && now.getDay() !== cfg.weekday) return null;

  const stamp = `${now.toDateString()} ${currentTime}`;
  if (lastTickStamp === stamp) return null; // sudah dijalankan menit ini
  lastTickStamp = stamp;

  try {
    const result = await writeBackupToDisk('scheduled');
    await prisma.settings.upsert({
      where: { key: 'backup_last_run' },
      update: { value: new Date().toISOString() },
      create: { key: 'backup_last_run', value: new Date().toISOString() },
    });
    console.log(`[Backup] Scheduled backup created: ${result.fileName} (${(result.size / 1024).toFixed(1)} KB) @ ${result.location}`);
    return result;
  } catch (err) {
    console.error('[Backup] Scheduled backup failed:', err.message);
    return null;
  }
}

module.exports = {
  DEFAULT_BACKUP_DIR,
  models,
  getBackupDir,
  createBackupObject,
  writeBackupToDisk,
  listBackupFiles,
  pruneOldBackups,
  resolveBackupFile,
  validateBackupLocation,
  listDirectories,
  createDirectory,
  getBackupConfig,
  saveBackupConfig,
  runScheduledBackupIfDue,
};
