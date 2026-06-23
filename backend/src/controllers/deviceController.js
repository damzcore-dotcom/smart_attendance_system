const prisma = require('../prismaClient');
const ZKLib = require('node-zklib');
const crypto = require('crypto');
const { getAttendancesWithRetry } = require('../utils/zkHelper');
const { recordAuditLog } = require('./auditLogController');
const { adjustZkTimeToUTC, getJakartaDateKey } = require('../utils/dateHelper');

const { handleControllerError } = require('../middleware/validate');
// Sync cache is stored in the database Settings table (key: sync_preview_{token})
// This ensures cache survives server restarts and PM2 multi-instance deployments
const CACHE_TIMEOUT_MINUTES = 15;
const { getNextEmployeeCode } = require('../utils/employeeUtils');


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
// Expanded: menangani berbagai penulisan nama di mesin fingerprint
const NAME_ABBREVIATIONS = {
  // Muhammad variants
  'm':    ['muhammad', 'muhamad', 'muh', 'moch', 'mochamad', 'mohamad', 'mohammad'],
  'muh':  ['muhammad', 'muhamad'],
  'moh':  ['mohammad', 'mohamad', 'muhammad', 'muhamad'],
  'mhd':  ['muhammad', 'muhamad'],
  'md':   ['muhammad', 'muhamad'],
  'moch': ['mochamad', 'mohamad', 'mochammad'],
  'mochammad': ['mochamad', 'mohamad'],
  // Ahmad / Achmad variants
  'a':   ['ahmad', 'achmad', 'achmat', 'ahmat'],
  'ach': ['achmad', 'ahmad'],
  'akh': ['akhmat', 'akhmad'],
  // Abdul variants
  'abd':  ['abdul', 'abdu'],
  'abdu': ['abdul'],
  // Siti — KUNCI: mesin sering tulis "St" bukan "Siti"
  'st':   ['siti'],
  'siti': ['st'],
  // Nur variants
  'nur':  ['nur', 'nuru', 'nurul', 'nuri'],
  'nrl':  ['nurul'],
  'nuru': ['nurul', 'nur'],
  // Rizky variants
  'r':    ['rizky', 'rizki', 'risky', 'ricky'],
  'rzk':  ['rizky', 'rizki'],
  // Haji / Hajjah
  'h':    ['haji', 'hajjah'],
  'hj':   ['haji', 'hajjah'],
  'hjh':  ['hajjah'],
  // Sri
  'sri':  ['sri'],
  'sry':  ['sri'],
  // Dwi
  'dw':   ['dwi'],
  'dwi':  ['dw'],
  // Khoirul / Khairul variants
  'kh':   ['khoirul', 'khairul', 'khalid', 'kholid'],
  'khol': ['kholid', 'khalid'],
  // Agus / Agung
  'ag':   ['agus', 'agung'],
  'ags':  ['agus'],
  // Tambahan singkatan satu/dua huruf yang umum di mesin
  'n':    ['nur', 'nurul', 'nuri', 'nuru'],
  'dede': ['dede'],
  'ade':  ['ade'],
};

/**
 * Normalisasi nama: lowercase, hapus titik/koma, pecah jadi kata-kata
 */
function normalizeName(name) {
  if (!name) return [];
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
  
  // Cek prefix matching (minimal 4 huruf)
  // Contoh: "abdu" cocok dengan "abdul"
  if (wordA.length >= 4 && wordB.startsWith(wordA)) return true;
  if (wordB.length >= 4 && wordA.startsWith(wordB)) return true;
  
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
  
  // Skor = persentase kata yang cocok dari nama TERPENDEK (machine-first scoring)
  // Ini menangani kasus nama terpotong di mesin:
  // Contoh: "Rahayu Maulida" (mesin) vs "Rahayu Maulida Inayah" (DB) → skor 2/2 = 100%
  // Bukan 2/3 = 67% seperti sebelumnya
  const minWords = Math.min(machineWords.length, dbWords.length);
  const maxWords = Math.max(machineWords.length, dbWords.length);
  
  // Gunakan minWords agar nama terpotong di mesin tidak dihukum
  return Math.round((matchCount / minWords) * 100);
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
    if (!emp || !emp.name) continue; // Skip employees with null/missing name
    const dbWords = normalizeName(emp.name);
    if (dbWords.length === 0) continue;
    const score = calculateNameScore(machineWords, dbWords);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = emp;
    }
  }
  
  // Raised threshold to 80% to prevent false-positive name matching
  // which could link wrong employee to a fingerprint ID
  // FIX: Guard against bestMatch being null (empty employeeList or all scores = 0)
  if (!bestMatch || bestScore < 80) {
    return null;
  }
  
  const lengthRatio = Math.min(bestMatch.name.length, machineName.length) / Math.max(bestMatch.name.length, machineName.length);
  if (lengthRatio >= 0.7) {
    return bestMatch;
  }
  
  return null;
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

      let committedLinked = 0;
      let committedNew = 0;
      let committedPinFixed = 0;

      for (const item of selectedUsers) {
        const fingerPrintId = String(item.acNo).trim();

        if (item.status === 'linked' && item.dbMatchId) {
          // Bersihkan PIN dari karyawan lain jika ada konflik
          await prisma.employee.updateMany({
            where: {
              fingerPrintId,
              id: { not: item.dbMatchId }
            },
            data: { fingerPrintId: null }
          });

          // Check if the target employee already has a different fingerPrintId
          const targetEmp = await prisma.employee.findUnique({ where: { id: item.dbMatchId }, select: { fingerPrintId: true, name: true } });
          if (targetEmp?.fingerPrintId && targetEmp.fingerPrintId !== fingerPrintId) {
            console.warn(`[Commit] ⚠️ Overwriting fingerPrintId for employee ${targetEmp.name}: ${targetEmp.fingerPrintId} → ${fingerPrintId}`);
          }
          // Auto-link: update existing employee's fingerPrintId
          await prisma.employee.update({
            where: { id: item.dbMatchId },
            data: { fingerPrintId }
          });
          committedLinked++;
          console.log(`[Commit] ✅ Linked AC No.${fingerPrintId} → Employee ID ${item.dbMatchId}`);
        } else if (item.status === 'pin_mismatch' && item.dbMatchId) {
          // Bersihkan PIN dari karyawan lain jika ada konflik
          await prisma.employee.updateMany({
            where: {
              fingerPrintId,
              id: { not: item.dbMatchId }
            },
            data: { fingerPrintId: null }
          });

          // PIN mismatch: karyawan ditemukan di DB dengan nama cocok tapi fingerPrintId berbeda
          // Sesuai instruksi user: update fingerPrintId di DB agar cocok dengan mesin
          await prisma.employee.update({
            where: { id: item.dbMatchId },
            data: { fingerPrintId }
          });
          committedPinFixed++;
          console.log(`[Commit] 🔄 PIN updated: AC No.${fingerPrintId} → Employee ID ${item.dbMatchId} (old PIN: ${item.oldFingerPrintId || 'unknown'})`);
        } else if (item.status === 'new') {
          // Tetap lakukan pemeriksaan untuk karyawan baru agar tidak terjadi duplikasi PIN
          const alreadyExists = await prisma.employee.findFirst({ where: { fingerPrintId } });
          if (alreadyExists) continue;

          // Create new employee with sequential NIK
          const nextCode = await getNextEmployeeCode();
          await prisma.employee.create({
            data: {
              employeeCode: nextCode,
              name: item.machineName || 'User Mesin ' + fingerPrintId,
              fingerPrintId,
              email: `emp${nextCode}@system.local`,
              departmentId: defaultDept.id,
              status: 'ACTIVE'
            }
          });
          committedNew++;
          console.log(`[Commit] ➕ New employee NIK ${nextCode}: "${item.machineName}" (FP: ${fingerPrintId})`);
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
        message: `Berhasil disimpan! ${committedLinked} auto-link, ${committedPinFixed} update PIN, ${committedNew} karyawan baru.`
      });
    }

    // ──────────────────────────────────────────────
    // PREVIEW MODE: Scan machine, classify, return data
    // ──────────────────────────────────────────────
    zkInstance = new ZKLib(device.ipAddress, device.port, 60000, 30000);
    
    try {
      await zkInstance.createSocket();
    } catch (connErr) {
      return res.status(503).json({
        success: false,
        message: `Tidak dapat terhubung ke mesin "${device.name}" (${device.ipAddress}:${device.port}). Pastikan mesin menyala dan terhubung ke jaringan yang sama dengan server.`
      });
    }

    let users;
    try {
      users = await zkInstance.getUsers();
      if (!users || !users.data) {
        return res.status(502).json({
          success: false,
          message: `Mesin "${device.name}" terhubung namun tidak mengembalikan data user. Coba lagi atau restart mesin.`
        });
      }
    } catch (getUsersErr) {
      return res.status(502).json({
        success: false,
        message: `Gagal membaca data karyawan dari mesin "${device.name}": ${getUsersErr.message}. Coba Test Koneksi terlebih dahulu.`
      });
    }
    
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

    let timezoneOffset = 420;
    try {
      const tzSetting = await prisma.settings.findUnique({ where: { key: 'timezoneOffset' } });
      if (tzSetting) timezoneOffset = parseInt(tzSetting.value, 10);
    } catch (e) {
      console.warn('[Sync Users] Failed to fetch timezoneOffset setting:', e.message);
    }

    if (logs && logs.data) {
      for (const log of logs.data) {
        const pinStr = String(log.deviceUserId).trim();
        const recordTime = adjustZkTimeToUTC(new Date(log.recordTime), timezoneOffset);
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
    let pinMismatchCount = 0;
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
              { employmentStatus: { not: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } } }
            ]
          },
          {
            OR: [
              { salaryCategory: null },
              { salaryCategory: { not: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } } }
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

    // Pool untuk deteksi PIN mismatch:
    // Karyawan yang sudah punya fingerPrintId di DB tapi PIN-nya berbeda dengan mesin
    // Ini menangani kasus karyawan ada di DB tapi fingerPrintId-nya salah/lama
    let mutablePinMismatchPool = allDbEmployees
      .filter(e => e.name && e.name.trim().length > 0)
      .map(e => ({ id: e.id, name: e.name, fingerPrintId: e.fingerPrintId }));

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
      // FIX Bug 2.2: Users who have NEVER scanned on this device (e.g. newly transferred)
      // have no log entry at all — they are NOT inactive, they are new.
      const isNewUser = !latestScanMap.hasOwnProperty(fingerPrintId);
      
      if (!isNewUser && !hasRecentActivity) {
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
      
      // 2b. FALLBACK: Deteksi PIN mismatch
      // Cari nama di pool karyawan yang sudah punya fingerPrintId berbeda
      if (machineName) {
        const pinMismatchMatch = findBestNameMatch(machineName, mutablePinMismatchPool);
        if (pinMismatchMatch) {
          // Hapus dari pool agar tidak di-match dua kali
          const idx = mutablePinMismatchPool.findIndex(e => e.id === pinMismatchMatch.id);
          if (idx !== -1) mutablePinMismatchPool.splice(idx, 1);
          pinMismatchCount++;
          syncDetails.push({
            acNo: fingerPrintId,
            machineName,
            dbName: pinMismatchMatch.name,
            dbMatchId: pinMismatchMatch.id,
            oldFingerPrintId: pinMismatchMatch.fingerPrintId,
            status: 'pin_mismatch',
            statusText: 'Update PIN (Nama Cocok, PIN Beda)'
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
      message: `Preview: ${linkedCount} auto-link, ${pinMismatchCount} update PIN, ${newCount} baru, ${alreadyLinkedCount} sudah terlink, ${inactiveCount} diabaikan.`,
      deviceId: parseInt(id),
      data: {
        totalMachine: users.data.length,
        linked: linkedCount,
        pinMismatch: pinMismatchCount,
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
 * Sync Attendance
 */
const syncAttendance = async (req, res) => {
  const { id } = req.params;
  console.log(`[Sync] Starting attendance sync for device ID: ${id}`);
  
  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) {
      console.error(`[Sync] Device with ID ${id} not found`);
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const settingsList = await prisma.settings.findMany();
    const timezoneOffsetSetting = settingsList.find(s => s.key === 'timezoneOffset')?.value || '420';
    const timezoneOffset = parseInt(timezoneOffsetSetting, 10);

    console.log(`[Sync] Connecting to device at ${device.ipAddress}:${device.port} with retry logic...`);
    
    // Fetch logs with retry — picks the best result from multiple attempts
    const { logs, bestCount, allAttemptCounts } = await getAttendancesWithRetry(
      device.ipAddress, device.port, 3
    );
    
    console.log(`[Sync] Best fetch result: ${bestCount} logs from ${allAttemptCounts.length} attempt(s).`);

    if (!logs || !logs.data || logs.data.length === 0) {
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
          fetchAttempts: allAttemptCounts
        } 
      });
    }

    // Sample the date range of device logs for diagnostics
    let earliestDeviceLog = null;
    let latestDeviceLog = null;
    for (const log of logs.data) {
      const rt = adjustZkTimeToUTC(new Date(log.recordTime), timezoneOffset);
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
              { employmentStatus: { not: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } } }
            ]
          },
          {
            OR: [
              { salaryCategory: null },
              { salaryCategory: { not: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } } }
            ]
          }
        ]
      },
      include: { shift: true }
    });
    const empByFingerPrint = {};
    const empByCode = {};
    const empById = {};
    employees.forEach(e => {
      empById[e.id] = e;
      if (e.fingerPrintId) empByFingerPrint[e.fingerPrintId.trim()] = e;
      if (e.employeeCode) empByCode[e.employeeCode.trim()] = e;
      if (e.idNumber) empByCode[e.idNumber.trim()] = e;
    });

    const { calculateLateness, resolveStatus, parsePenaltySettings, isManualCorrection, classifyDayScans } = require('../utils/lateCalculator');

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

    // Group logs by User + Date — collect ALL timestamps
    // Diagnostic counters
    let totalLogsFromDevice = logs.data.length;
    let logsInRange = 0;
    let logsMatchedEmployee = 0;
    const unmatchedPins = new Map(); // PIN → machine user name

    const grouped = {};
    for (const log of logs.data) {
      const pinStr = String(log.deviceUserId).trim();
      const recordTime = adjustZkTimeToUTC(new Date(log.recordTime), timezoneOffset);
      
      // Skip records outside of filter range
      if (recordTime < filterStart || recordTime > filterEnd) continue;
      logsInRange++;

      // TIMEZONE: derive the calendar date in Asia/Jakarta (WIB) directly so grouping
      // no longer depends on the server's local timezone. recordTime is already a true
      // UTC instant (from adjustZkTimeToUTC); getJakartaDateKey converts it back to the
      // WIB calendar date. This fixes morning scans being grouped into the wrong day
      // whenever the server is not running in WIB.
      const dateKey = getJakartaDateKey(recordTime);
      
      const emp = empByFingerPrint[pinStr] || empByCode[pinStr];
      if (!emp) {
        // Track unmatched PINs for diagnostics
        if (!unmatchedPins.has(pinStr)) {
          unmatchedPins.set(pinStr, log.userName || log.name || `User PIN ${pinStr}`);
        }
        continue;
      }
      logsMatchedEmployee++;

      const key = `${emp.id}|${dateKey}`;
      if (!grouped[key]) {
        const [gy, gm, gd] = dateKey.split('-').map(Number);
        grouped[key] = { employeeId: emp.id, employee: emp, date: new Date(Date.UTC(gy, gm - 1, gd, 0, 0, 0, 0)), scans: [] };
      }
      const verifyMode = log.verifyMode !== undefined ? log.verifyMode : 1;
      grouped[key].scans.push({ time: recordTime, verifyMode });
    }

    console.log(`[Sync] Diagnostics: ${totalLogsFromDevice} total logs, ${logsInRange} in range, ${logsMatchedEmployee} matched, ${unmatchedPins.size} unmatched PINs`);
    if (unmatchedPins.size > 0) {
      console.log(`[Sync] ⚠️ Unmatched PINs (first 10):`, Array.from(unmatchedPins.entries()).slice(0, 10).map(([pin, name]) => `${pin}:${name}`).join(', '));
    }

    // Process grouped records
    const recordsToCreate = [];
    const entries = Object.values(grouped);
    
    const { penaltyRules, roundingConfig } = parsePenaltySettings(settingsList);
    const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
    const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
    const globalGracePeriod = parseInt(settingsList.find(s => s.key === 'gracePeriod')?.value || '15', 10);
    const defaultShiftStart = settingsList.find(s => s.key === 'defaultShiftStart')?.value || '08:00';
    const defaultShiftEnd = settingsList.find(s => s.key === 'defaultShiftEnd')?.value || '17:00';
    
    // Fetch Overrides for all active employees within this sync date range
    const allOverrides = await prisma.employeeShiftOverride.findMany({
      where: {
        startDate: { lte: filterEnd },
        endDate: { gte: filterStart }
      },
      include: { shift: true }
    });

    // Create a fast lookup map: employeeId_YYYY-MM-DD -> shift
    const overrideMap = new Map();
    for (const ov of allOverrides) {
      let d = new Date(ov.startDate);
      const endD = new Date(ov.endDate);
      while (d <= endD) {
        const dStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
        overrideMap.set(`${ov.employeeId}_${dStr}`, ov.shift);
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }

    for (const entry of entries) {
      const emp = entry.employee;
      const dStr = `${entry.date.getUTCFullYear()}-${String(entry.date.getUTCMonth()+1).padStart(2,'0')}-${String(entry.date.getUTCDate()).padStart(2,'0')}`;
      
      // Determine effective shift
      const overrideShift = overrideMap.get(`${emp.id}_${dStr}`);
      const effectiveShift = overrideShift || emp.shift || null;

      const shiftStart = effectiveShift?.startTime || defaultShiftStart;
      let shiftEnd = effectiveShift?.endTime || defaultShiftEnd;
      const gracePeriod = effectiveShift ? effectiveShift.gracePeriod : globalGracePeriod;
      
      // Override shiftEnd untuk hari Sabtu sesuai shift protocol
      const dayOfWeek = entry.date.getUTCDay(); // 0=Sun, 6=Sat
      if (dayOfWeek === 6) {
        const satType = effectiveShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
        if (satType === 'HALF_DAY') {
          shiftEnd = effectiveShift?.saturdayEndTime || satCheckoutTime;
        }
      }
      
      // Sort all scans chronologically
      entry.scans.sort((a, b) => a.time - b.time);

      const earliestScan = entry.scans[0];
      const earliestVerifyMode = earliestScan.verifyMode;

      // Classify masuk/pulang via the shared helper so manual sync and auto-sync
      // cron stay byte-for-byte identical (PERBAIKAN_ABSENSI.md #5).
      const { checkIn, checkOut } = classifyDayScans(
        entry.scans.map(s => s.time),
        shiftStart,
        shiftEnd
      );

      // Calculate Lateness (only if checkIn exists)
      const calc = checkIn
        ? calculateLateness(checkIn, shiftStart, gracePeriod, shiftEnd, roundingConfig, penaltyRules)
        : { lateMinutes: 0, status: 'MANGKIR' };
      
      // Resolve status using updated logic
      const status = resolveStatus(checkIn, checkOut, calc.status, entry.date, penaltyRules, shiftEnd, shiftStart);
      
      // Determine verification mode
      let finalMode = 'Fingered';
      if (earliestVerifyMode === 0 || earliestVerifyMode === 3 || earliestVerifyMode === 4) {
        finalMode = 'Pinned';
      } else if (earliestVerifyMode === 2) {
        finalMode = 'Carded';
      } else if (earliestVerifyMode === 15) {
        finalMode = 'Face Machine';
      }
      
      recordsToCreate.push({
        employeeId: entry.employeeId,
        date: entry.date,
        checkIn: checkIn,
        checkOut: checkOut,
        status: status,
        lateMinutes: calc.lateMinutes,
        mode: finalMode,
        shiftStart,
        shiftEnd,
        gracePeriod
      });
    }

    // Check if it's just a preview request
    const isPreview = req.query.preview === 'true';

    if (isPreview) {
      // Generate a unique sync token and persist to DB (survives server restarts)
      const syncToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + CACHE_TIMEOUT_MINUTES * 60 * 1000);
      await prisma.settings.upsert({
        where: { key: `sync_preview_${syncToken}` },
        create: {
          key: `sync_preview_${syncToken}`,
          value: JSON.stringify({ deviceId: parseInt(id), records: recordsToCreate, expiresAt: expiresAt.toISOString() })
        },
        update: {
          value: JSON.stringify({ deviceId: parseInt(id), records: recordsToCreate, expiresAt: expiresAt.toISOString() })
        }
      });

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
        message = `Ditemukan ${recordsToCreate.length} record absen baru. (Terbaik dari ${allAttemptCounts.length}x percobaan: [${allAttemptCounts.join(', ')}] log)`;
      } else if (totalLogsFromDevice === 0) {
        message = 'Tidak ada data log di mesin.';
      } else if (logsInRange === 0) {
        message = `Ditemukan ${totalLogsFromDevice} log di mesin, tapi tidak ada yang masuk dalam range tanggal ${startDateQuery || 'default'} s/d ${endDateQuery || 'default'}. (${allAttemptCounts.length}x percobaan)`;
      } else {
        message = `Ditemukan ${totalLogsFromDevice} log di mesin (${logsInRange} dalam range tanggal), tapi ${unmatchedPins.size} PIN tidak cocok dengan karyawan manapun. Jalankan "Sync Personnel" terlebih dahulu untuk menghubungkan data mesin dengan database karyawan.`;
      }

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
          fetchAttempts: allAttemptCounts
        }
      });
    }

    // Bulk Upsert (preserves and merges check-in/out times for multi-device support)
    let saved = 0;
    const savedEmployees = new Set();
    for (const record of recordsToCreate) {
      try {
        // Fetch existing record first to merge check-in and check-out times
        const existingRecord = await prisma.attendance.findUnique({
          where: {
            employeeId_date: {
              employeeId: record.employeeId,
              date: record.date
            }
          }
        });

        // Protect manual HRD corrections from being overwritten by fingerprint sync
        // (consistent with the auto-sync cron). Skip the record entirely if manual.
        if (existingRecord && isManualCorrection(existingRecord)) {
          console.log(`[Sync] Skipping emp ${record.employeeId} on ${record.date.toISOString().split('T')[0]} to protect manual HRD correction.`);
          continue;
        }

        let mergedCheckIn = record.checkIn;
        let mergedCheckOut = record.checkOut;
        let finalStatus = record.status;
        let lateMins = record.lateMinutes;

        if (existingRecord) {
          // Merge times:
          // checkIn should be the earliest of (existing.checkIn, new.checkIn)
          // checkOut should be the latest of (existing.checkOut, new.checkOut)
          if (record.checkIn) {
            mergedCheckIn = existingRecord.checkIn 
              ? (record.checkIn < existingRecord.checkIn ? record.checkIn : existingRecord.checkIn) 
              : record.checkIn;
          } else {
            mergedCheckIn = existingRecord.checkIn;
          }

          if (record.checkOut) {
            mergedCheckOut = existingRecord.checkOut 
              ? (record.checkOut > existingRecord.checkOut ? record.checkOut : existingRecord.checkOut) 
              : record.checkOut;
          } else {
            mergedCheckOut = existingRecord.checkOut;
          }

          // Recalculate status and lateness based on merged times
          const calc = mergedCheckIn
            ? calculateLateness(mergedCheckIn, record.shiftStart, record.gracePeriod, record.shiftEnd, roundingConfig, penaltyRules)
            : { lateMinutes: 0, status: 'MANGKIR' };
          
          lateMins = calc.lateMinutes;
          finalStatus = resolveStatus(mergedCheckIn, mergedCheckOut, calc.status, record.date, penaltyRules, record.shiftEnd, record.shiftStart);
        }

        // C5 FIX: Concurrency-safe Upsert
        await prisma.attendance.upsert({
          where: { employeeId_date: { employeeId: record.employeeId, date: record.date } },
          update: {
            checkIn: mergedCheckIn,
            checkOut: mergedCheckOut,
            status: finalStatus,
            lateMinutes: lateMins,
            mode: record.mode,
            source: 'fingerprint'
          },
          create: {
            employeeId: record.employeeId,
            date: record.date,
            checkIn: record.checkIn,
            checkOut: record.checkOut,
            status: record.status,
            lateMinutes: record.lateMinutes,
            mode: record.mode,
            source: 'fingerprint'
          }
        });
        saved++;
        savedEmployees.add(record.employeeId);
      } catch (e) {
        console.error(`[Sync] Failed record for emp ${record.employeeId}:`, e.message);
      }
    }

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
      message: `Sinkronisasi Absen berhasil. ${saved} record absen diperbarui. (Terbaik dari ${allAttemptCounts.length}x percobaan: [${allAttemptCounts.join(', ')}] log)`,
      savedCount: saved,
      employeeCount: savedEmployees.size
    });
  } catch (err) {
    // Tandai offline jika gagal
    try {
      await prisma.device.update({
        where: { id: parseInt(id) },
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

    // Load cached preview data from DB (persists across server restarts)
    const cacheEntry = await prisma.settings.findUnique({ where: { key: `sync_preview_${syncToken}` } });
    if (!cacheEntry) {
      return res.status(400).json({ 
        success: false, 
        message: 'Sesi sinkronisasi tidak valid atau telah kedaluwarsa. Silakan jalankan sync ulang dari mesin.' 
      });
    }
    
    let cachedData;
    try {
      cachedData = JSON.parse(cacheEntry.value);
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Data sesi rusak. Silakan jalankan sync ulang.' });
    }
    
    // Check if expired
    if (new Date(cachedData.expiresAt) < new Date()) {
      await prisma.settings.delete({ where: { key: `sync_preview_${syncToken}` } }).catch(() => {});
      return res.status(400).json({ 
        success: false, 
        message: 'Sesi sinkronisasi telah kedaluwarsa (15 menit). Silakan jalankan sync ulang.' 
      });
    }

    if (cachedData.deviceId !== parseInt(id)) {
      return res.status(400).json({ success: false, message: 'Token sinkronisasi tidak cocok dengan mesin ini' });
    }

    const records = cachedData.records;

    if (!records || records.length === 0) {
      await prisma.settings.delete({ where: { key: `sync_preview_${syncToken}` } }).catch(() => {});
      return res.json({ success: true, message: 'Tidak ada data untuk disimpan.' });
    }

    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const { calculateLateness, resolveStatus, parsePenaltySettings, isManualCorrection, classifyDayScans } = require('../utils/lateCalculator');

    // Fetch non-BHL employees
    const employees = await prisma.employee.findMany({
      where: {
        AND: [
          {
            OR: [
              { employmentStatus: null },
              { employmentStatus: { not: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } } }
            ]
          },
          {
            OR: [
              { salaryCategory: null },
              { salaryCategory: { not: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } } }
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
    const defaultShiftStart = settingsList.find(s => s.key === 'defaultShiftStart')?.value || '08:00';
    const defaultShiftEnd = settingsList.find(s => s.key === 'defaultShiftEnd')?.value || '17:00';

    let saved = 0;
    let failed = 0;

    for (const record of records) {
      try {
        const employeeId = record.employeeId;
        const checkIn = record.checkIn ? new Date(record.checkIn) : null;
        const checkOut = record.checkOut ? new Date(record.checkOut) : null;

        // Double check: if it's a BHL employee, we skip it
        const emp = empMap[employeeId];
        if (!emp) {
          console.warn(`[Commit] Skipping record with no employeeId or BHL employee: ${employeeId}`);
          failed++;
          continue;
        }

        // Normalize date to UTC midnight for @db.Date compatibility
        const rawDate = new Date(record.date);
        if (isNaN(rawDate.getTime())) {
          console.error(`[Commit] Invalid date for record: ${JSON.stringify(record)}`);
          failed++;
          continue;
        }
        const date = new Date(Date.UTC(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate()));

        // Recalculate status based on employee's shift and overrides if not in record
        const shiftStart = record.shiftStart || emp?.shift?.startTime || defaultShiftStart;
        const gracePeriod = record.gracePeriod !== undefined ? record.gracePeriod : (emp?.shift?.gracePeriod || globalGracePeriod);
        let shiftEnd = record.shiftEnd || emp?.shift?.endTime || defaultShiftEnd;

        // Apply Saturday shift protocol fallback if not stored
        if (!record.shiftEnd && date.getUTCDay() === 6) {
          const satType = emp?.shift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
          if (satType === 'HALF_DAY') {
            shiftEnd = emp?.shift?.saturdayEndTime || satCheckoutTime;
          }
        }

        const calc = checkIn
          ? calculateLateness(checkIn, shiftStart, gracePeriod, shiftEnd, roundingConfig, penaltyRules)
          : { lateMinutes: 0, status: 'MANGKIR' };
        const status = resolveStatus(checkIn, checkOut, calc.status, date, penaltyRules, shiftEnd, shiftStart);

        // Preserve the verification mode captured during preview ('Fingered'/'Pinned'/
        // 'Carded'/'Face Machine'); fall back to 'Fingerprint' for older preview tokens.
        const recordMode = record.mode || 'Fingerprint';

        // Concurrency-safe Read-Modify-Write transaction
        let skippedManual = false;
        await prisma.$transaction(async (tx) => {
          const existingRecord = await tx.attendance.findUnique({
            where: {
              employeeId_date: {
                employeeId: employeeId,
                date: date
              }
            }
          });

          // Protect manual HRD corrections from being overwritten (consistent with cron).
          if (existingRecord && isManualCorrection(existingRecord)) {
            skippedManual = true;
            return;
          }

          let mergedCheckIn = checkIn;
          let mergedCheckOut = checkOut;
          let finalStatus = status;
          let lateMins = calc.lateMinutes;

          if (existingRecord) {
            if (checkIn) {
              mergedCheckIn = existingRecord.checkIn 
                ? (checkIn < existingRecord.checkIn ? checkIn : existingRecord.checkIn) 
                : checkIn;
            } else {
              mergedCheckIn = existingRecord.checkIn;
            }

            if (checkOut) {
              mergedCheckOut = existingRecord.checkOut 
                ? (checkOut > existingRecord.checkOut ? checkOut : existingRecord.checkOut) 
                : checkOut;
            } else {
              mergedCheckOut = existingRecord.checkOut;
            }

            // Recalculate based on merged
            const calcMerged = mergedCheckIn
              ? calculateLateness(mergedCheckIn, shiftStart, gracePeriod, shiftEnd, roundingConfig, penaltyRules)
              : { lateMinutes: 0, status: 'MANGKIR' };
            lateMins = calcMerged.lateMinutes;
            finalStatus = resolveStatus(mergedCheckIn, mergedCheckOut, calcMerged.status, date, penaltyRules, shiftEnd, shiftStart);
          }

          await tx.attendance.upsert({
            where: {
              employeeId_date: {
                employeeId: employeeId,
                date: date
              }
            },
            create: {
              employeeId,
              date,
              checkIn: mergedCheckIn,
              checkOut: mergedCheckOut,
              status: finalStatus,
              lateMinutes: lateMins,
              mode: recordMode,
              source: 'fingerprint'
            },
            update: {
              checkIn: mergedCheckIn || undefined,
              checkOut: mergedCheckOut || undefined,
              status: finalStatus,
              lateMinutes: lateMins,
              mode: recordMode,
              source: 'fingerprint'
            }
          });
        });

        if (skippedManual) {
          console.log(`[Commit] Skipping emp ${employeeId} on ${date.toISOString().split('T')[0]} to protect manual HRD correction.`);
          continue;
        }

        saved++;
      } catch (e) {
        console.error(`[Commit] Failed record for emp ${record.employeeId}:`, e.message);
        failed++;
      }
    }

    // Update last sync time
    await prisma.device.update({
      where: { id: parseInt(id) },
      data: { lastSync: new Date(), status: 'ONLINE' }
    });

    // Cleanup DB cache entry
    await prisma.settings.delete({ where: { key: `sync_preview_${syncToken}` } }).catch(() => {});

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

    zkInstance = new ZKLib(device.ipAddress, device.port, 15000, 15000);
    await zkInstance.createSocket();
    
    // Fetch logs before clearing to create a backup (L-20)
    let logsCount = 0;
    try {
      const logs = await zkInstance.getAttendances();
      if (logs && logs.data) {
        let timezoneOffset = 420;
        try {
          const tzSetting = await prisma.settings.findUnique({ where: { key: 'timezoneOffset' } });
          if (tzSetting) timezoneOffset = parseInt(tzSetting.value, 10);
        } catch (e) {
          console.warn('[Device] Failed to fetch timezoneOffset setting:', e.message);
        }

        logs.data.forEach(log => {
          log.recordTime = adjustZkTimeToUTC(new Date(log.recordTime), timezoneOffset);
        });

        logsCount = logs.data.length;
        const backupKey = `device_clear_backup_${device.id}_${Date.now()}`;
        await prisma.settings.upsert({
          where: { key: backupKey },
          create: {
            key: backupKey,
            value: JSON.stringify({
              deviceId: device.id,
              deviceName: device.name,
              clearedAt: new Date().toISOString(),
              records: logs.data
            })
          },
          update: {
            value: JSON.stringify({
              deviceId: device.id,
              deviceName: device.name,
              clearedAt: new Date().toISOString(),
              records: logs.data
            })
          }
        });
        console.log(`[Device] Backup created successfully under key: ${backupKey}. Total records: ${logsCount}`);
      }
    } catch (backupErr) {
      console.warn(`[Device] Failed to create backup before clearing: ${backupErr.message}`);
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
        message: `Cleared all attendance logs from device ${device.name}`,
        device: device.name,
        ipAddress: device.ipAddress,
        recordsCleared: logsCount
      }),
      ipAddress: req.ip
    });

    res.json({ success: true, message: `Seluruh data log absensi di mesin ${device.name} berhasil dihapus.` });
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
      take: parseInt(req.query.limit) || 20,
      skip: parseInt(req.query.offset) || 0
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
    
    const total = await prisma.auditLog.count({
      where: {
        entity: 'Device',
        action: {
          in: ['SYNC', 'TEST_CONNECTION']
        }
      }
    });

    res.json({ success: true, data: parsedLogs, total });
  } catch (err) {
    handleControllerError(res, err, 'deviceController');
  }
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
  getDeviceSyncLogs
};
