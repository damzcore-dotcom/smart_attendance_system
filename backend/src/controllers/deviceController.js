const prisma = require('../prismaClient');
const ZKLib = require('node-zklib');
const crypto = require('crypto');
const { recordAuditLog } = require('./auditLogController');

const { handleControllerError } = require('../middleware/validate');
const deviceSync = require('../utils/deviceSync');
// Short-lived cache for attendance sync preview data
const attendanceSyncCache = new Map();
const CACHE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

// Progres tarik absensi per-device (dipantau UI via GET /:id/sync-progress)
global.deviceSyncProgress = global.deviceSyncProgress || {};
const setSyncProgress = (id, percent, phase, message = '') => {
  global.deviceSyncProgress[id] = {
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    phase,
    message,
    ts: Date.now(),
  };
};
const clearSyncProgress = (id, delay = 5000) => {
  setTimeout(() => { delete global.deviceSyncProgress[id]; }, delay);
};


/**
 * Get all devices
 */
const getDevices = async (req, res) => {
  try {
    const devices = await prisma.device.findMany({
      orderBy: { id: 'asc' }
    });
    const locations = await prisma.location.findMany();
    
    // Manually merge locations to avoid schema relation errors
    const devicesWithLocation = devices.map(d => ({
      ...d,
      location: d.locationId ? locations.find(loc => loc.id === d.locationId) : null
    }));

    res.json({ success: true, data: devicesWithLocation });
  } catch (err) {
    handleControllerError(res, err, 'deviceController');
  }
};

/**
 * Get quick device stats (Users & Logs count)
 */
const getDeviceStats = async (req, res) => {
  const { id } = req.params;
  let zk = null;
  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false });

    // Gunakan timeout yang sangat singkat (5 detik) agar tidak memblokir UI
    zk = new ZKLib(device.ipAddress, device.port, 5000, 5000);
    await zk.createSocket();
    const info = await zk.getInfo();

    res.json({
      success: true,
      data: {
        userCounts: info.userCounts || 0,
        logCounts: info.logCounts || 0
      }
    });
  } catch (err) {
    res.json({
      success: true,
      data: {
        userCounts: '-',
        logCounts: '-'
      }
    });
  } finally {
    if (zk) {
      try {
        await zk.disconnect();
      } catch (e) {}
    }
  }
};

/**
 * Add new device
 */
const addDevice = async (req, res) => {
  try {
    const { name, ipAddress, port, locationId } = req.body;
    
    // Check for duplicate IP or Name
    const existingDevice = await prisma.device.findFirst({
      where: {
        OR: [
          { name: name },
          { ipAddress: ipAddress }
        ]
      }
    });

    if (existingDevice) {
      return res.status(400).json({ 
        success: false, 
        message: `Device with same ${existingDevice.name === name ? 'name' : 'IP address'} already exists.` 
      });
    }

    const device = await prisma.device.create({
      data: { name, ipAddress, port: parseInt(port) || 4370, locationId: locationId ? parseInt(locationId) : null }
    });

    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'CREATE',
      entity: 'Device',
      entityId: device.id,
      details: JSON.stringify({ name: device.name, ipAddress: device.ipAddress, port: device.port }),
      ipAddress: req.ip
    });

    res.json({ success: true, data: device });
  } catch (err) {
    handleControllerError(res, err, 'deviceController');
  }
};

/**
 * Delete device
 */
const deleteDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    await prisma.device.delete({ where: { id: parseInt(id) } });

    if (device) {
      await recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: 'DELETE',
        entity: 'Device',
        entityId: device.id,
        details: JSON.stringify({ name: device.name, ipAddress: device.ipAddress }),
        ipAddress: req.ip
      });
    }

    res.json({ success: true, message: 'Device deleted' });
  } catch (err) {
    handleControllerError(res, err, 'deviceController');
  }
};

/**
 * Test Connection to device
 */
const testConnection = async (req, res) => {
  const { id, ipAddress, port } = req.body;
  let zkInstance = null;
  
  try {
    zkInstance = new ZKLib(ipAddress, port || 4370, 60000, 30000);
    await zkInstance.createSocket();
    
    // Test if we can read info
    const info = await zkInstance.getInfo();
    
    let deviceName = 'Mesin Baru';
    if (id) {
      const dev = await prisma.device.update({
        where: { id: parseInt(id) },
        data: { status: 'ONLINE' }
      });
      deviceName = dev.name;
    }
    
    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'TEST_CONNECTION',
      entity: 'Device',
      entityId: id ? parseInt(id) : null,
      details: JSON.stringify({ name: deviceName, ipAddress, port, status: 'SUCCESS', message: 'Koneksi berhasil!' }),
      ipAddress: req.ip
    });
    
    res.json({ success: true, message: 'Koneksi berhasil!', info });
  } catch (err) {
    let deviceName = 'Mesin Baru';
    if (id) {
      try {
        const dev = await prisma.device.update({
          where: { id: parseInt(id) },
          data: { status: 'OFFLINE' }
        });
        deviceName = dev.name;
      } catch (e) {}
    }
    
    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'TEST_CONNECTION',
      entity: 'Device',
      entityId: id ? parseInt(id) : null,
      details: JSON.stringify({ name: deviceName, ipAddress, port, status: 'FAILED', message: err.message || 'Gagal menghubungi mesin.' }),
      ipAddress: req.ip
    });
    
    res.status(500).json({ success: false, message: 'Gagal menghubungi mesin. Pastikan IP dan Port benar dan mesin menyala.' });
  } finally {
    if (zkInstance) {
      try {
        await zkInstance.disconnect();
      } catch (e) {}
    }
  }
};

/**
 * FUZZY NAME MATCHING UTILITIES
 * Menangani perbedaan penulisan nama antara mesin fingerprint dan database HRD
 * Contoh: "M.Faizal Akbar" (mesin) ↔ "Muhammad Faizal Akbar" (database)
 */

// Daftar singkatan umum nama Indonesia
const NAME_ABBREVIATIONS = {
  'm': ['muhammad', 'muhamad', 'muh', 'moch', 'mochamad', 'mohamad', 'mohammad'],
  'a': ['ahmad', 'achmad', 'achmat', 'ahmat'],
  'abd': ['abdul', 'abdu'],
  'muh': ['muhammad', 'muhamad'],
  'moch': ['mochamad', 'mohamad'],
  'r': ['rizky', 'rizki', 'risky', 'ricky'],
  'h': ['haji', 'hajjah'],
  'siti': ['siti'],
  'sri': ['sri'],
  'nur': ['nur', 'nuru', 'nurul'],
  'dw': ['dwi'],
};

/**
 * Normalisasi nama: lowercase, hapus titik/koma, pecah jadi kata-kata
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[.,\-_'"]/g, ' ')   // Ganti tanda baca dengan spasi
    .replace(/\s+/g, ' ')          // Hapus spasi ganda
    .trim()
    .split(' ')
    .filter(w => w.length > 0);
}

/**
 * Cek apakah dua kata cocok (termasuk singkatan)
 */
function wordsMatch(wordA, wordB) {
  if (wordA === wordB) return true;
  
  // Cek apakah salah satu adalah singkatan dari yang lain
  // Contoh: "m" cocok dengan "muhammad"
  for (const [abbr, fullNames] of Object.entries(NAME_ABBREVIATIONS)) {
    if ((wordA === abbr && fullNames.includes(wordB)) ||
        (wordB === abbr && fullNames.includes(wordA))) {
      return true;
    }
  }
  
  // Cek prefix matching (minimal 3 huruf)
  // Contoh: "muh" cocok dengan "muhammad"
  if (wordA.length >= 3 && wordB.startsWith(wordA)) return true;
  if (wordB.length >= 3 && wordA.startsWith(wordB)) return true;
  
  return false;
}

/**
 * Hitung skor kecocokan antara nama mesin dan nama database (0-100)
 */
function calculateNameScore(machineWords, dbWords) {
  if (machineWords.length === 0 || dbWords.length === 0) return 0;
  
  let matchCount = 0;
  const usedDbIndexes = new Set();
  
  for (const mWord of machineWords) {
    for (let i = 0; i < dbWords.length; i++) {
      if (usedDbIndexes.has(i)) continue;
      if (wordsMatch(mWord, dbWords[i])) {
        matchCount++;
        usedDbIndexes.add(i);
        break;
      }
    }
  }
  
  // Skor = persentase kata yang cocok dari total kata terpendek
  const minWords = Math.min(machineWords.length, dbWords.length);
  const maxWords = Math.max(machineWords.length, dbWords.length);
  
  // Hitung berdasarkan total kata terpanjang agar lebih akurat
  return Math.round((matchCount / maxWords) * 100);
}

/**
 * Cari nama karyawan terbaik dari database yang cocok dengan nama mesin
 * Return: Employee object atau null jika tidak ada yang cocok
 */
function findBestNameMatch(machineName, employeeList) {
  const machineWords = normalizeName(machineName);
  if (machineWords.length === 0) return null;
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const emp of employeeList) {
    const dbWords = normalizeName(emp.name);
    const score = calculateNameScore(machineWords, dbWords);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = emp;
    }
  }
  
  // Threshold: minimal 60% kata cocok untuk dianggap match
  // Untuk nama 3 kata, minimal 2 kata harus cocok
  if (bestScore >= 60) {
    return bestMatch;
  }
  
  return null;
}

/**
 * Generate next sequential NIK from database
 * Finds the highest numeric employeeCode and increments it
 */
async function getNextEmployeeCode() {
  // Konsisten dgn create utama: pindai employeeCode DAN user.username (hindari tabrakan), abaikan kode BHL.
  const [employees, users] = await Promise.all([
    prisma.employee.findMany({ where: { NOT: { employeeCode: { startsWith: 'BHL-' } } }, select: { employeeCode: true } }),
    prisma.user.findMany({ where: { NOT: { username: { startsWith: 'BHL-' } } }, select: { username: true } }),
  ]);

  let maxCode = 0;
  for (const emp of employees) {
    const n = parseInt(String(emp.employeeCode || '').replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > maxCode) maxCode = n;
  }
  for (const u of users) {
    const n = parseInt(String(u.username || '').replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > maxCode) maxCode = n;
  }

  return String(maxCode + 1);
}

/**
 * Sync Users (Enrollment dari Mesin ke Sistem)
 * Supports two modes via query param ?preview=true|false
 * - preview=true (default): Scan the machine, classify users, return preview data WITHOUT writing to DB
 * - preview=false: Accept selectedUsers from body and commit only those to DB
 */
const syncUsers = async (req, res) => {
  const { id } = req.params; // Device ID
  const isPreview = req.query.preview !== 'false'; // Default to preview mode
  let zkInstance = null;
  
  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    // ──────────────────────────────────────────────
    // COMMIT MODE: Write selected users to database
    // ──────────────────────────────────────────────
    if (!isPreview) {
      const { selectedUsers } = req.body;
      if (!selectedUsers || !Array.isArray(selectedUsers) || selectedUsers.length === 0) {
        return res.json({ success: true, message: 'Tidak ada karyawan yang dipilih untuk disinkronkan.' });
      }

      let defaultDept = await prisma.department.findFirst({ where: { name: 'General' } });
      if (!defaultDept) {
        defaultDept = await prisma.department.create({ data: { name: 'General' } });
      }

      const bcrypt = require('bcryptjs');
      let committedLinked = 0;
      let committedNew = 0;
      let committedFailed = 0;

      // Tiap item dibungkus try/catch agar satu kegagalan tidak membatalkan seluruh commit
      for (const item of selectedUsers) {
        try {
          const fingerPrintId = String(item.acNo).trim();

          // Double-check: skip if already linked in DB
          const alreadyExists = await prisma.employee.findFirst({ where: { fingerPrintId } });
          if (alreadyExists) continue;

          if (item.status === 'linked' && item.dbMatchId) {
            // Auto-link: update existing employee's fingerPrintId
            await prisma.employee.update({
              where: { id: item.dbMatchId },
              data: { fingerPrintId }
            });
            committedLinked++;
            console.log(`[Commit] ✅ Linked AC No.${fingerPrintId} → Employee ID ${item.dbMatchId}`);
          } else if (item.status === 'new') {
            // Create new employee with sequential NIK (NIK aman: pindai employee+user)
            const nextCode = await getNextEmployeeCode();
            const newEmp = await prisma.employee.create({
              data: {
                employeeCode: nextCode,
                name: item.machineName || 'User Mesin ' + fingerPrintId,
                fingerPrintId,
                email: `emp${nextCode}@system.local`,
                departmentId: defaultDept.id,
                employmentStatus: 'TETAP',
                status: 'ACTIVE'
              }
            });
            // Buat akun login (konsisten dgn create utama untuk karyawan non-BHL)
            try {
              const hashed = await bcrypt.hash('password123', 10);
              await prisma.user.create({ data: { username: nextCode, password: hashed, role: 'EMPLOYEE', employeeId: newEmp.id, mustChangePassword: true } });
            } catch (uerr) {
              console.warn(`[Commit] Akun login gagal dibuat utk NIK ${nextCode}: ${uerr.message}`);
            }
            committedNew++;
            console.log(`[Commit] ➕ New employee NIK ${nextCode}: "${item.machineName}" (FP: ${fingerPrintId})`);
          }
        } catch (itemErr) {
          committedFailed++;
          console.error(`[Commit] Gagal proses user mesin AC ${item.acNo}: ${itemErr.message}`);
        }
      }

      await prisma.device.update({
        where: { id: parseInt(id) },
        data: { status: 'ONLINE', lastSync: new Date() }
      });

      await recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: 'SYNC',
        entity: 'Device',
        entityId: device.id,
        details: JSON.stringify({
          message: 'Sync personnel committed successfully',
          autoLinked: committedLinked,
          createdNew: committedNew,
          device: device.name
        }),
        ipAddress: req.ip
      });

      return res.json({
        success: true,
        message: `Berhasil disimpan! ${committedLinked} auto-link, ${committedNew} karyawan baru${committedFailed > 0 ? `, ${committedFailed} gagal` : ''}.`
      });
    }

    // ──────────────────────────────────────────────
    // PREVIEW MODE: Scan machine, classify, return data
    // ──────────────────────────────────────────────
    zkInstance = new ZKLib(device.ipAddress, device.port, 180000, 90000);
    await zkInstance.createSocket();
    const users = await zkInstance.getUsers();
    
    // Fetch attendance logs to filter out old, inactive users who haven't fingerprinted in > 60 days
    let logs = null;
    try {
      logs = await zkInstance.getAttendances();
    } catch (err) {
      console.warn('[Sync Users] Failed to fetch attendances to filter inactive users:', err.message);
    }
    
    try {
      await zkInstance.disconnect();
    } catch (e) {
      console.warn('[Sync Users] Failed to disconnect socket:', e.message);
    }
    zkInstance = null; // Reset so finally block won't call it again

    // Map of deviceUserId -> latest scan date
    const latestScanMap = {};
    let globalLatestScan = new Date(0);

    if (logs && logs.data) {
      for (const log of logs.data) {
        const pinStr = String(log.deviceUserId).trim();
        const recordTime = new Date(log.recordTime);
        if (!latestScanMap[pinStr] || recordTime > latestScanMap[pinStr]) {
          latestScanMap[pinStr] = recordTime;
        }
        if (recordTime > globalLatestScan) {
          globalLatestScan = recordTime;
        }
      }
    }

    let newCount = 0;
    let linkedCount = 0;
    let alreadyLinkedCount = 0;
    let inactiveCount = 0;
    const syncDetails = [];

    // Preload all unlinked employees for fuzzy matching (excluding BHL)
    const unlinkedEmployees = await prisma.employee.findMany({
      where: {
        AND: [
          {
            OR: [
              { fingerPrintId: null },
              { fingerPrintId: '' }
            ]
          },
          {
            OR: [
              { employmentStatus: null },
              { employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } }
            ]
          },
          {
            OR: [
              { salaryCategory: null },
              { salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } }
            ]
          }
        ]
      }
    });

    // OPTIMIZATION: Preload all active employees with fingerPrintId from DB to avoid N+1 queries in the loop
    const allDbEmployees = await prisma.employee.findMany({
      where: { fingerPrintId: { not: null } },
      select: { id: true, name: true, fingerPrintId: true }
    });
    const dbEmpByFpMap = new Map();
    allDbEmployees.forEach(e => {
      dbEmpByFpMap.set(String(e.fingerPrintId).trim(), e);
    });

    // Hitung ambang batas 60 hari dari aktivitas TERAKHIR di mesin
    const thresholdDate = globalLatestScan.getTime() > 0 ? new Date(globalLatestScan) : new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 60);

    for (const u of users.data) {
      const fingerPrintId = String(u.userId).trim();
      const machineName = (u.name || '').trim();
      
      // OPTIMIZED: Use Map lookup instead of prisma.employee.findFirst 979 times
      let existing = dbEmpByFpMap.get(fingerPrintId);
      
      if (existing) {
        alreadyLinkedCount++;
        syncDetails.push({
          acNo: fingerPrintId,
          machineName,
          dbName: existing.name,
          status: 'already_linked',
          statusText: 'Sudah Terlink'
        });
        continue;
      }
      
      // Check if employee has fingerprint activity in the last 60 days
      const lastScan = latestScanMap[fingerPrintId];
      const hasRecentActivity = lastScan && lastScan >= thresholdDate;
      
      if (!hasRecentActivity) {
        inactiveCount++;
        syncDetails.push({
          acNo: fingerPrintId,
          machineName,
          dbName: '-',
          status: 'inactive_ignored',
          statusText: 'Diabaikan (Karyawan Lama / Inaktif > 60 Hari)'
        });
        continue;
      }
      
      // 2. FUZZY NAME MATCHING — preview only, no DB writes
      if (machineName) {
        const bestMatch = findBestNameMatch(machineName, unlinkedEmployees);
        
        if (bestMatch) {
          // Remove from unlinked list so it won't match again in this loop
          const idx = unlinkedEmployees.findIndex(e => e.id === bestMatch.id);
          if (idx !== -1) unlinkedEmployees.splice(idx, 1);
          linkedCount++;
          syncDetails.push({
            acNo: fingerPrintId,
            machineName,
            dbName: bestMatch.name,
            dbMatchId: bestMatch.id,
            status: 'linked',
            statusText: 'Auto-Link (Preview)'
          });
          continue;
        }
      }
      
      // 3. Tidak ditemukan — preview sebagai karyawan baru
      newCount++;
      syncDetails.push({
        acNo: fingerPrintId,
        machineName: machineName || 'User Mesin ' + fingerPrintId,
        dbName: '-',
        status: 'new',
        statusText: 'Karyawan Baru (Belum Disimpan)'
      });
    }

    // Update device status to ONLINE
    await prisma.device.update({
      where: { id: parseInt(id) },
      data: { status: 'ONLINE', lastSync: new Date() }
    });

    res.json({ 
      success: true, 
      message: `Preview: ${linkedCount} auto-link, ${newCount} baru, ${alreadyLinkedCount} sudah terlink, ${inactiveCount} diabaikan.`,
      deviceId: parseInt(id),
      data: {
        totalMachine: users.data.length,
        linked: linkedCount,
        new: newCount,
        alreadyLinked: alreadyLinkedCount,
        inactive: inactiveCount,
        skipped: alreadyLinkedCount + inactiveCount,
        details: syncDetails
      }
    });
  } catch (err) {
    console.error(err);
    try {
      await prisma.device.update({
        where: { id: parseInt(id) },
        data: { status: 'OFFLINE' }
      });
    } catch (e) {}
    handleControllerError(res, err, 'deviceController');
  } finally {
    if (zkInstance) {
      try {
        await zkInstance.disconnect();
        console.log('[Sync Users] Socket disconnected in finally block.');
      } catch (e) {
        console.error('[Sync Users] Failed to disconnect ZK socket in finally block:', e.message);
      }
    }
  }
};

/**
 * Helper: Fetch attendance logs from device with retry logic
 * node-zklib uses UDP which is unreliable for large data transfers.
 * This function retries multiple times and picks the best (largest) result.
 */
async function fetchAttendancesWithRetry(ipAddress, port, maxRetries = 5, onProgress = null) {
  let bestResult = null;
  let bestCount = 0;
  const allAttemptCounts = [];
  let deviceReportedCount = null;

  // Pengaman kalibrasi jam: default AKTIF, tapi bisa dimatikan via setting agar jam mesin
  // tak ditimpa secara senyap (mencegah korupsi jam bila waktu server keliru).
  let calibrate = true;
  try {
    const s = await prisma.settings.findUnique({ where: { key: 'deviceTimeAutoCalibrate' } });
    if (s && s.value === 'false') calibrate = false;
  } catch (e) { /* default aktif */ }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let zk = null;
    try {
      // Timeout besar untuk log banyak: 180s koneksi, 90s antar-paket
      zk = new ZKLib(ipAddress, port, 180000, 90000);
      await zk.createSocket();

      // Auto-Calibrate Device Time to Server Time (hanya bila diizinkan)
      if (calibrate) {
        try {
          await zk.setTime(new Date());
          console.log(`[Sync] Device time calibrated successfully.`);
        } catch (err) {
          console.warn(`[Sync] Failed to calibrate device time: ${err.message}`);
        }
      } else {
        console.log(`[Sync] Auto-kalibrasi jam mesin dinonaktifkan (deviceTimeAutoCalibrate=false).`);
      }

      // Jumlah record yang DILAPORKAN mesin → untuk mendeteksi tarikan terpotong.
      try {
        const info = await zk.getInfo();
        if (info && typeof info.logCounts === 'number') {
          deviceReportedCount = info.logCounts;
        }
      } catch (e) { /* sebagian firmware tak mendukung getInfo */ }

      console.log(`[Sync] Attempt ${attempt}/${maxRetries}: Fetching attendance logs...`);
      // Callback progres unduh (received/total dalam byte) → laporkan ke UI
      const logs = await zk.getAttendances((received, total) => {
        if (onProgress && total) onProgress(received / total, attempt, maxRetries);
      });
      const count = logs?.data?.length || 0;
      allAttemptCounts.push(count);
      console.log(`[Sync] Attempt ${attempt}/${maxRetries}: Got ${count} logs.`);

      if (count > bestCount) {
        bestCount = count;
        bestResult = logs;
      }

      await zk.disconnect();

      // If we got a good amount of data, we can stop early on 2nd+ attempt
      // only if the count is stable (same as previous best)
      if (attempt >= 2 && count > 0 && count === bestCount) {
        console.log(`[Sync] Consistent result after ${attempt} attempts (${count} logs). Using this data.`);
        break;
      }
    } catch (err) {
      allAttemptCounts.push(0);
      console.warn(`[Sync] Attempt ${attempt}/${maxRetries} FAILED: ${err.message}`);
      try { if (zk) await zk.disconnect(); } catch (e) {}
      
      // Wait a bit before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const waitMs = 1000 * attempt; // 1s, 2s, 3s
        console.log(`[Sync] Waiting ${waitMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  }

  console.log(`[Sync] All attempt results: [${allAttemptCounts.join(', ')}] logs. Best: ${bestCount}`);
  const truncated = deviceReportedCount != null && bestCount < deviceReportedCount;
  if (truncated) {
    console.warn(`[Sync] ⚠️ Tarikan mungkin TERPOTONG: terbaca ${bestCount} dari ${deviceReportedCount} record yang dilaporkan mesin.`);
  }
  return { logs: bestResult, bestCount, allAttemptCounts, deviceReportedCount, truncated };
}

/**
 * Sync Attendance
 */
const syncAttendance = async (req, res) => {
  const { id } = req.params;
  const devId = parseInt(id);
  console.log(`[Sync] Starting attendance sync for device ID: ${id}`);

  try {
    const device = await prisma.device.findUnique({ where: { id: devId } });
    if (!device) {
      console.error(`[Sync] Device with ID ${id} not found`);
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    console.log(`[Sync] Connecting to device at ${device.ipAddress}:${device.port} with retry logic...`);
    setSyncProgress(devId, 3, 'connecting', 'Menghubungkan ke mesin...');

    // Fetch logs with retry — picks the best result from multiple attempts
    const { logs, bestCount, allAttemptCounts, deviceReportedCount, truncated } = await fetchAttendancesWithRetry(
      device.ipAddress, device.port, 5,
      (frac, attempt, max) => setSyncProgress(devId, 5 + frac * 60, 'fetching', `Mengunduh log (percobaan ${attempt}/${max})`)
    );
    const truncationWarning = truncated
      ? ` ⚠️ PERINGATAN: hanya ${bestCount} dari ${deviceReportedCount} record di mesin yang berhasil ditarik — kemungkinan terpotong, coba tarik ulang.`
      : '';

    console.log(`[Sync] Best fetch result: ${bestCount} logs from ${allAttemptCounts.length} attempt(s).`);
    setSyncProgress(devId, 70, 'processing', 'Memproses & memasangkan data...');

    if (!logs || !logs.data || logs.data.length === 0) {
      setSyncProgress(devId, 100, 'done', 'Tidak ada data log di mesin');
      clearSyncProgress(devId);
      return res.json({
        success: true,
        message: `Tidak ada data log di mesin. (${allAttemptCounts.length}x percobaan, hasil: [${allAttemptCounts.join(', ')}])`, 
        rawRecords: 0, 
        savedCount: 0,
        employeeCount: 0,
        diagnostics: { 
          totalLogsFromDevice: 0, logsInRange: 0, logsMatchedEmployee: 0, 
          unmatchedPinCount: 0, unmatchedPins: [], linkedEmployeeCount: 0, 
          totalEmployees: 0, deviceDateRange: null,
          fetchAttempts: allAttemptCounts,
          deviceReportedCount,
          truncated
        } 
      });
    }

    // Sample the date range of device logs for diagnostics
    let earliestDeviceLog = null;
    let latestDeviceLog = null;
    for (const log of logs.data) {
      const rt = new Date(log.recordTime);
      if (!isNaN(rt.getTime())) {
        if (!earliestDeviceLog || rt < earliestDeviceLog) earliestDeviceLog = rt;
        if (!latestDeviceLog || rt > latestDeviceLog) latestDeviceLog = rt;
      }
    }
    console.log(`[Sync] Device log date range: ${earliestDeviceLog?.toLocaleDateString()} → ${latestDeviceLog?.toLocaleDateString()}`);
    // Cocokkan PIN mesin (AC No.) dengan fingerPrintId sebagai prioritas utama
    // Fallback ke employeeCode dan idNumber untuk backward compatibility
    // Exclude BHL daily workers from sync attendance operations
    const employees = await prisma.employee.findMany({
      where: {
        AND: [
          {
            OR: [
              { employmentStatus: null },
              { employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } }
            ]
          },
          {
            OR: [
              { salaryCategory: null },
              { salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } }
            ]
          }
        ]
      },
      include: { shift: true }
    });
    const index = deviceSync.buildEmployeeIndex(employees);
    const { empByFingerPrint, empById } = index;

    // Parse query params for date filtering
    const startDateQuery = req.query.start;
    const endDateQuery = req.query.end;

    let filterStart = new Date();
    filterStart.setDate(filterStart.getDate() - 30); // Default cutoff
    filterStart.setHours(0, 0, 0, 0);
    let filterEnd = new Date();
    filterEnd.setHours(23, 59, 59, 999);

    if (startDateQuery) {
      // FIX TIMEZONE: Parse as LOCAL time (not UTC) to match device timestamps
      filterStart = new Date(`${startDateQuery}T00:00:00`);
    }
    if (endDateQuery) {
      // FIX TIMEZONE: Parse as LOCAL time (not UTC) to match device timestamps
      filterEnd = new Date(`${endDateQuery}T23:59:59.999`);
    }

    console.log(`[Sync] Date filter: ${filterStart.toLocaleString()} → ${filterEnd.toLocaleString()}`);

    // Bangun record via LOGIKA BERSAMA (deviceSync.buildAttendanceRecords) — sama persis dengan
    // jalur cron & "Hapus Log": klasifikasi masuk/pulang berbasis shift + penyimpanan WIB→UTC
    // env-independent + diagnostik. Menghapus duplikasi yang dulu rawan menyimpang.
    const settingsList = await prisma.settings.findMany();
    const syncSettings = deviceSync.loadSyncSettings(settingsList);
    const { penaltyRules, roundingConfig } = syncSettings;

    const allOverrides = await prisma.employeeShiftOverride.findMany({
      where: { startDate: { lte: filterEnd }, endDate: { gte: filterStart } },
      include: { shift: true }
    });
    const overrideMap = deviceSync.buildOverrideMap(allOverrides);

    const { records: recordsToCreate, diagnostics } = deviceSync.buildAttendanceRecords({
      logs, index, overrideMap, settings: syncSettings, filterStart, filterEnd
    });
    const totalLogsFromDevice = diagnostics.totalLogs;
    const logsInRange = diagnostics.logsInRange;
    const logsMatchedEmployee = diagnostics.logsMatched;
    const unmatchedPins = diagnostics.unmatchedPins;

    console.log(`[Sync] Diagnostics: ${totalLogsFromDevice} total logs, ${logsInRange} in range, ${logsMatchedEmployee} matched, ${unmatchedPins.size} unmatched PINs`);
    if (unmatchedPins.size > 0) {
      console.log(`[Sync] ⚠️ Unmatched PINs (first 10):`, Array.from(unmatchedPins.entries()).slice(0, 10).map(([pin, name]) => `${pin}:${name}`).join(', '));
    }

    setSyncProgress(devId, 90, 'finalizing', 'Menyiapkan hasil...');

    // Check if it's just a preview request
    const isPreview = req.query.preview === 'true';

    if (isPreview) {
      // Generate a unique sync token and cache the records on the backend
      const syncToken = crypto.randomUUID();
      attendanceSyncCache.set(syncToken, {
        deviceId: parseInt(id),
        records: recordsToCreate,
        expiresAt: Date.now() + CACHE_TIMEOUT
      });
      // Automatically cleanup token after timeout
      setTimeout(() => {
        attendanceSyncCache.delete(syncToken);
      }, CACHE_TIMEOUT);

      // Map back to a friendlier format for frontend display
      // Include employeeId so the frontend can send it back for direct commit
      const previewData = recordsToCreate.map(r => {
        const emp = empById[r.employeeId];
        return {
          employeeId: r.employeeId,
          employeeName: emp ? emp.name : 'Unknown',
          employeeCode: emp ? emp.employeeCode : '-',
          date: r.date,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          status: r.status,
          lateMinutes: r.lateMinutes
        };
      });

      // Build diagnostic message
      let message;
      if (recordsToCreate.length > 0) {
        message = `Ditemukan ${recordsToCreate.length} record absen baru. (Terbaik dari ${allAttemptCounts.length}x percobaan: [${allAttemptCounts.join(', ')}] log)${truncationWarning}`;
      } else if (totalLogsFromDevice === 0) {
        message = 'Tidak ada data log di mesin.';
      } else if (logsInRange === 0) {
        message = `Ditemukan ${totalLogsFromDevice} log di mesin, tapi tidak ada yang masuk dalam range tanggal ${startDateQuery || 'default'} s/d ${endDateQuery || 'default'}. (${allAttemptCounts.length}x percobaan)`;
      } else {
        message = `Ditemukan ${totalLogsFromDevice} log di mesin (${logsInRange} dalam range tanggal), tapi ${unmatchedPins.size} PIN tidak cocok dengan karyawan manapun. Jalankan "Sync Personnel" terlebih dahulu untuk menghubungkan data mesin dengan database karyawan.`;
      }

      setSyncProgress(devId, 100, 'done', `${recordsToCreate.length} record siap ditinjau`);
      clearSyncProgress(devId);
      return res.json({
        success: true,
        message,
        syncToken, // <-- Secure session sync token
        data: previewData,
        rawRecords: recordsToCreate.length,
        diagnostics: {
          totalLogsFromDevice,
          logsInRange,
          logsMatchedEmployee,
          unmatchedPinCount: unmatchedPins.size,
          unmatchedPins: Array.from(unmatchedPins.entries()).slice(0, 20).map(([pin, name]) => ({ pin, name })),
          linkedEmployeeCount: Object.keys(empByFingerPrint).length,
          totalEmployees: employees.length,
          deviceDateRange: earliestDeviceLog && latestDeviceLog ? {
            earliest: earliestDeviceLog.toISOString(),
            latest: latestDeviceLog.toISOString()
          } : null,
          fetchAttempts: allAttemptCounts,
          deviceReportedCount,
          truncated
        }
      });
    }

    // Simpan via logika bersama: merge (masuk paling awal/pulang paling akhir) + proteksi HRD/cuti + label seragam
    setSyncProgress(devId, 80, 'saving', 'Menyimpan ke database...');
    const persistResult = await deviceSync.persistAttendanceRecords(recordsToCreate, { penaltyRules, roundingConfig });
    const saved = persistResult.saved;
    const savedEmployees = { size: persistResult.employeeCount };
    setSyncProgress(devId, 100, 'done', `${saved} record tersimpan`);
    clearSyncProgress(devId);

    // Update last sync time
    await prisma.device.update({
      where: { id: parseInt(id) },
      data: { lastSync: new Date(), status: 'ONLINE' }
    });

    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'SYNC',
      entity: 'Device',
      entityId: device.id,
      details: JSON.stringify({
        message: 'Direct attendance sync completed successfully',
        recordsSaved: saved,
        device: device.name
      }),
      ipAddress: req.ip
    });

    res.json({ 
      success: true, 
      message: `Sinkronisasi Absen berhasil. ${saved} record absen diperbarui. (Terbaik dari ${allAttemptCounts.length}x percobaan: [${allAttemptCounts.join(', ')}] log)${truncationWarning}`,
      savedCount: saved,
      employeeCount: savedEmployees.size
    });
  } catch (err) {
    setSyncProgress(devId, 100, 'error', err.message || 'Gagal menarik data');
    clearSyncProgress(devId);
    // Tandai offline jika gagal
    try {
      await prisma.device.update({
        where: { id: devId },
        data: { status: 'OFFLINE' }
      });
    } catch (e) {}
    handleControllerError(res, err, 'deviceController.syncAttendance');
  }
};

/**
 * Update device
 */
const updateDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, ipAddress, port, locationId, autoSyncEnabled, autoSyncTime } = req.body;
    
    // Check for duplicate IP or Name excluding current device, only for fields that are provided
    const orConditions = [];
    if (name !== undefined && name !== null) orConditions.push({ name });
    if (ipAddress !== undefined && ipAddress !== null) orConditions.push({ ipAddress });

    if (orConditions.length > 0) {
      const existingDevice = await prisma.device.findFirst({
        where: {
          id: { not: parseInt(id) },
          OR: orConditions
        }
      });

      if (existingDevice) {
        return res.status(400).json({ 
          success: false, 
          message: `Device with same ${existingDevice.name === name ? 'name' : 'IP address'} already exists.` 
        });
      }
    }

    // Build update payload dynamically to avoid overriding undefined fields with defaults
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (ipAddress !== undefined) updateData.ipAddress = ipAddress;
    if (port !== undefined) updateData.port = parseInt(port) || 4370;
    if (locationId !== undefined) updateData.locationId = locationId ? parseInt(locationId) : null;
    if (autoSyncEnabled !== undefined) updateData.autoSyncEnabled = !!autoSyncEnabled;
    if (autoSyncTime !== undefined) updateData.autoSyncTime = autoSyncTime || null;

    const device = await prisma.device.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'UPDATE',
      entity: 'Device',
      entityId: device.id,
      details: JSON.stringify({
        name: device.name,
        ipAddress: device.ipAddress,
        port: device.port,
        autoSyncEnabled: device.autoSyncEnabled,
        autoSyncTime: device.autoSyncTime
      }),
      ipAddress: req.ip
    });
    
    res.json({ success: true, message: 'Device updated successfully', data: device });
  } catch (err) {
    handleControllerError(res, err, 'deviceController');
  }
};

/**
 * Commit Attendance — save previewed data directly to database
 * This avoids re-fetching from the unreliable UDP fingerprint machine.
 * The frontend sends the preview records that were already fetched and verified by the user.
 */
const commitAttendance = async (req, res) => {
  const { id } = req.params;
  const { syncToken } = req.body;

  console.log(`[Commit] Saving attendance records for device ID: ${id} with syncToken: ${syncToken}`);

  try {
    if (!syncToken) {
      return res.status(400).json({ success: false, message: 'Token sinkronisasi diperlukan' });
    }

    const cachedData = attendanceSyncCache.get(syncToken);
    if (!cachedData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Sesi sinkronisasi tidak valid atau telah kedaluwarsa. Silakan jalankan sync ulang.' 
      });
    }

    if (cachedData.deviceId !== parseInt(id)) {
      return res.status(400).json({ success: false, message: 'Token sinkronisasi tidak cocok dengan mesin ini' });
    }

    const records = cachedData.records;

    if (!records || records.length === 0) {
      attendanceSyncCache.delete(syncToken);
      return res.json({ success: true, message: 'Tidak ada data untuk disimpan.' });
    }

    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const { calculateLateness, resolveStatus, parsePenaltySettings } = require('../utils/lateCalculator');
    
    // Fetch non-BHL employees
    const employees = await prisma.employee.findMany({
      where: {
        AND: [
          {
            OR: [
              { employmentStatus: null },
              { employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } }
            ]
          },
          {
            OR: [
              { salaryCategory: null },
              { salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } }
            ]
          }
        ]
      },
      include: { shift: true }
    });
    const empMap = {};
    employees.forEach(e => { empMap[e.id] = e; });

    // Fetch Saturday Half-Day settings
    const settingsList = await prisma.settings.findMany();
    const { penaltyRules, roundingConfig } = parsePenaltySettings(settingsList);
    const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
    const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
    const globalGracePeriod = parseInt(settingsList.find(s => s.key === 'gracePeriod')?.value || '15', 10);

    // Simpan via logika bersama (merge masuk-awal/pulang-akhir + proteksi HRD/cuti + label seragam)
    const result = await deviceSync.persistAttendanceRecords(records, { penaltyRules, roundingConfig });
    const saved = result.saved;
    const failed = result.failed;
    const skipped = result.skipped;
    if (skipped > 0) console.log(`[Commit] ${skipped} record dilewati (proteksi koreksi HRD/cuti).`);

    // Update last sync time
    await prisma.device.update({
      where: { id: parseInt(id) },
      data: { lastSync: new Date(), status: 'ONLINE' }
    });

    // Cleanup cache
    attendanceSyncCache.delete(syncToken);

    // Audit log
    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'SYNC',
      entity: 'Device',
      entityId: device.id,
      details: JSON.stringify({
        message: 'Attendance sync committed successfully via token',
        recordsSaved: saved,
        recordsFailed: failed,
        device: device.name
      }),
      ipAddress: req.ip
    });

    console.log(`[Commit] Done. Saved: ${saved}, Failed: ${failed}`);
    res.json({
      success: true,
      message: `Sinkronisasi Absen berhasil. ${saved} record absen disimpan${failed > 0 ? `, ${failed} gagal` : ''}.`
    });
  } catch (err) {
    handleControllerError(res, err, 'deviceController.commitAttendance');
  }
};

/**
 * Clear Attendance Logs from device
 */
const clearDeviceLogs = async (req, res) => {
  const { id } = req.params;
  let zkInstance = null;

  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    console.log(`[Device] Clearing attendance logs for device ${device.name}...`);

    zkInstance = new ZKLib(device.ipAddress, device.port, 180000, 90000);
    await zkInstance.createSocket();

    // SAFETY: tarik & simpan SELURUH log dulu sebelum dihapus agar tidak ada data yang hilang.
    let savedBeforeClear = 0;
    try {
      const logs = await zkInstance.getAttendances();
      if (logs && logs.data && logs.data.length > 0) {
        const employees = await prisma.employee.findMany({ where: deviceSync.nonBhlWhere(), include: { shift: true } });
        const index = deviceSync.buildEmployeeIndex(employees);
        const settingsList = await prisma.settings.findMany();
        const syncSettings = deviceSync.loadSyncSettings(settingsList);
        const overrides = await prisma.employeeShiftOverride.findMany({ include: { shift: true } });
        const overrideMap = deviceSync.buildOverrideMap(overrides);
        const { records } = deviceSync.buildAttendanceRecords({ logs, index, overrideMap, settings: syncSettings, filterStart: null, filterEnd: null });
        const r = await deviceSync.persistAttendanceRecords(records, syncSettings);
        savedBeforeClear = r.saved;
        console.log(`[Device] Pre-clear sync: ${r.saved} disimpan, ${r.skipped} dilewati, ${r.failed} gagal.`);
      }
    } catch (e) {
      // Jika gagal menyimpan, JANGAN hapus log (cegah kehilangan data)
      console.error('[Device] Pre-clear sync failed, aborting clear:', e.message);
      return res.status(500).json({ success: false, message: 'Gagal menyimpan log sebelum menghapus — penghapusan dibatalkan agar data tidak hilang. Coba "Tarik Absensi" dulu.' });
    }

    await zkInstance.clearAttendanceLog();

    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'DELETE',
      entity: 'Device',
      entityId: device.id,
      details: JSON.stringify({
        message: `Cleared all attendance logs from device ${device.name} (after syncing ${savedBeforeClear} records)`,
        device: device.name,
        ipAddress: device.ipAddress,
        syncedBeforeClear: savedBeforeClear
      }),
      ipAddress: req.ip
    });

    res.json({ success: true, message: `${savedBeforeClear} record absen tersimpan lebih dulu, lalu seluruh log di mesin ${device.name} berhasil dihapus.` });
  } catch (err) {
    handleControllerError(res, err, 'deviceController.clearDeviceLogs');
  } finally {
    if (zkInstance) {
      try {
        await zkInstance.disconnect();
      } catch (e) {}
    }
  }
};

const getDeviceSyncLogs = async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        entity: 'Device',
        action: {
          in: ['SYNC', 'TEST_CONNECTION']
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });
    
    const parsedLogs = logs.map(log => {
      let detailsParsed = {};
      try {
        detailsParsed = JSON.parse(log.details || '{}');
      } catch (e) {
        detailsParsed = { message: log.details };
      }
      return {
        id: log.id,
        username: log.username,
        action: log.action,
        details: detailsParsed,
        createdAt: log.createdAt
      };
    });
    
    res.json({ success: true, data: parsedLogs });
  } catch (err) {
    handleControllerError(res, err, 'deviceController');
  }
};

// GET /:id/sync-progress — progres tarik absensi terkini (dipanggil polling oleh UI)
const getSyncProgress = (req, res) => {
  const id = parseInt(req.params.id);
  const progress = global.deviceSyncProgress[id] || { percent: 0, phase: 'idle', message: '' };
  res.json({ success: true, progress });
};

module.exports = {
  getDevices,
  addDevice,
  updateDevice,
  deleteDevice,
  testConnection,
  syncUsers,
  syncAttendance,
  commitAttendance,
  getDeviceStats,
  clearDeviceLogs,
  getDeviceSyncLogs,
  getSyncProgress
};
