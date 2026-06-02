const prisma = require('../prismaClient');
const ZKLib = require('node-zklib');
const crypto = require('crypto');
const { recordAuditLog } = require('./auditLogController');

// Short-lived cache for attendance sync preview data
const attendanceSyncCache = new Map();
const CACHE_TIMEOUT = 15 * 60 * 1000; // 15 minutes


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
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get quick device stats (Users & Logs count)
 */
const getDeviceStats = async (req, res) => {
  const { id } = req.params;
  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false });

    // Gunakan timeout yang sangat singkat (5 detik) agar tidak memblokir UI
    const zk = new ZKLib(device.ipAddress, device.port, 5000, 5000);
    await zk.createSocket();
    const info = await zk.getInfo();
    await zk.disconnect();

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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Test Connection to device
 */
const testConnection = async (req, res) => {
  const { id, ipAddress, port } = req.body;
  
  try {
    const zkInstance = new ZKLib(ipAddress, port || 4370, 60000, 30000);
    await zkInstance.createSocket();
    
    // Test if we can read info
    const info = await zkInstance.getInfo();
    await zkInstance.disconnect();
    
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
  const allEmployees = await prisma.employee.findMany({
    select: { employeeCode: true },
    orderBy: { id: 'desc' }
  });
  
  let maxCode = 0;
  for (const emp of allEmployees) {
    // Extract pure numeric codes (skip 'FNG' prefixed or non-numeric codes)
    const code = emp.employeeCode || '';
    const numericPart = parseInt(code.replace(/\D/g, ''), 10);
    if (!isNaN(numericPart) && numericPart > maxCode) {
      maxCode = numericPart;
    }
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

      for (const item of selectedUsers) {
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
        message: `Berhasil disimpan! ${committedLinked} auto-link, ${committedNew} karyawan baru.`
      });
    }

    // ──────────────────────────────────────────────
    // PREVIEW MODE: Scan machine, classify, return data
    // ──────────────────────────────────────────────
    const zkInstance = new ZKLib(device.ipAddress, device.port, 60000, 30000);
    await zkInstance.createSocket();
    const users = await zkInstance.getUsers();
    
    // Fetch attendance logs to filter out old, inactive users who haven't fingerprinted in > 60 days
    let logs = null;
    try {
      logs = await zkInstance.getAttendances();
    } catch (err) {
      console.warn('[Sync Users] Failed to fetch attendances to filter inactive users:', err.message);
    }
    await zkInstance.disconnect();

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

    // Hitung ambang batas 60 hari dari aktivitas TERAKHIR di mesin
    const thresholdDate = globalLatestScan.getTime() > 0 ? new Date(globalLatestScan) : new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 60);

    for (const u of users.data) {
      const fingerPrintId = String(u.userId).trim();
      const machineName = (u.name || '').trim();
      
      // 1. Cek apakah sudah ada karyawan dengan fingerPrintId ini
      let existing = await prisma.employee.findFirst({ where: { fingerPrintId } });
      
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
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Helper: Fetch attendance logs from device with retry logic
 * node-zklib uses UDP which is unreliable for large data transfers.
 * This function retries multiple times and picks the best (largest) result.
 */
async function fetchAttendancesWithRetry(ipAddress, port, maxRetries = 3) {
  let bestResult = null;
  let bestCount = 0;
  const allAttemptCounts = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let zk = null;
    try {
      // Use longer timeouts: 60s connect, 30s intra-packet for large data
      zk = new ZKLib(ipAddress, port, 60000, 30000);
      await zk.createSocket();
      
      // Auto-Calibrate Device Time to Server Time
      try {
        await zk.setTime(new Date());
        console.log(`[Sync] Device time calibrated successfully.`);
      } catch (err) {
        console.warn(`[Sync] Failed to calibrate device time: ${err.message}`);
      }
      
      console.log(`[Sync] Attempt ${attempt}/${maxRetries}: Fetching attendance logs...`);
      const logs = await zk.getAttendances();
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
  return { logs: bestResult, bestCount, allAttemptCounts };
}

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

    console.log(`[Sync] Connecting to device at ${device.ipAddress}:${device.port} with retry logic...`);
    
    // Fetch logs with retry — picks the best result from multiple attempts
    const { logs, bestCount, allAttemptCounts } = await fetchAttendancesWithRetry(
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
    const empByFingerPrint = {};
    const empByCode = {};
    const empById = {};
    employees.forEach(e => {
      empById[e.id] = e;
      if (e.fingerPrintId) empByFingerPrint[e.fingerPrintId.trim()] = e;
      if (e.employeeCode) empByCode[e.employeeCode.trim()] = e;
      if (e.idNumber) empByCode[e.idNumber.trim()] = e;
    });

    const { calculateLateness, resolveStatus, parsePenaltySettings } = require('../utils/lateCalculator');
    
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
      const recordTime = new Date(log.recordTime);
      
      // Skip records outside of filter range
      if (recordTime < filterStart || recordTime > filterEnd) continue;
      logsInRange++;

      // FIX TIMEZONE BUG:
      // toISOString() uses UTC. In WIB (UTC+7), 06:58 AM on May 1st becomes 23:58 PM on April 30th!
      // This caused morning scans to be grouped into the PREVIOUS day, causing flipped check-ins.
      // We must construct the date string using LOCAL TIME instead.
      const year = recordTime.getFullYear();
      const month = String(recordTime.getMonth() + 1).padStart(2, '0');
      const day = String(recordTime.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
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
      grouped[key].scans.push(recordTime);
    }

    console.log(`[Sync] Diagnostics: ${totalLogsFromDevice} total logs, ${logsInRange} in range, ${logsMatchedEmployee} matched, ${unmatchedPins.size} unmatched PINs`);
    if (unmatchedPins.size > 0) {
      console.log(`[Sync] ⚠️ Unmatched PINs (first 10):`, Array.from(unmatchedPins.entries()).slice(0, 10).map(([pin, name]) => `${pin}:${name}`).join(', '));
    }

    // Process grouped records
    const recordsToCreate = [];
    const entries = Object.values(grouped);
    
    // Fetch Saturday Half-Day settings
    const settingsList = await prisma.settings.findMany();
    const { penaltyRules, roundingConfig } = parsePenaltySettings(settingsList);
    const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
    const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
    const globalGracePeriod = parseInt(settingsList.find(s => s.key === 'gracePeriod')?.value || '15', 10);
    
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

      const shiftStart = effectiveShift?.startTime || '08:00';
      let shiftEnd = effectiveShift?.endTime || '17:00';
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
      entry.scans.sort((a, b) => a - b);
      
      const earliest = entry.scans[0];
      const latest = entry.scans[entry.scans.length - 1];
      
      let checkIn = null;
      let checkOut = null;
      
      // Treat multiple scans within 60 minutes of each other as a single scan day
      // to handle duplicate/double-tap scans when arriving or leaving.
      const timeDiffMinutes = (latest - earliest) / (1000 * 60);
      const isSingleScan = entry.scans.length === 1 || timeDiffMinutes < 60;
      
      if (isSingleScan) {
        // === SMART SINGLE-SCAN DETECTION ===
        // Calculate shift midpoint to determine if scan is check-in or check-out
        const [startH, startM] = shiftStart.split(':').map(Number);
        const [endH, endM] = shiftEnd.split(':').map(Number);
        const shiftStartMinutes = startH * 60 + startM;
        let shiftEndMinutes = endH * 60 + endM;
        
        if (shiftEndMinutes < shiftStartMinutes) {
          shiftEndMinutes += 24 * 60; // Handle night shift crossing midnight
        }
        
        const midpointMinutes = Math.floor((shiftStartMinutes + shiftEndMinutes) / 2);
        
        const scanHour = earliest.getHours();
        const scanMinute = earliest.getMinutes();
        let scanMinutes = scanHour * 60 + scanMinute;
        
        // If it's a night shift and the scan is in the morning (after midnight)
        if (shiftEndMinutes > 1440 && scanMinutes < shiftStartMinutes - 6 * 60) {
          scanMinutes += 24 * 60;
        }
        
        if (scanMinutes <= midpointMinutes) {
          // Scan sebelum/saat tengah shift → ini MASUK (checkIn)
          checkIn = earliest;
          checkOut = null;
        } else {
          // Scan setelah tengah shift → ini PULANG (checkOut)
          checkIn = null;
          checkOut = earliest;
        }
      } else {
        // Multiple scans — paling awal = checkIn, paling akhir = checkOut
        checkIn = earliest;
        checkOut = latest;
      }
      
      // Calculate Lateness (only if checkIn exists)
      const calc = checkIn 
        ? calculateLateness(checkIn, shiftStart, gracePeriod, shiftEnd, roundingConfig)
        : { lateMinutes: 0, status: 'Mangkir' };
      
      // Resolve status using updated logic
      const status = resolveStatus(checkIn, checkOut, calc.status, entry.date, penaltyRules, shiftEnd, shiftStart);

      recordsToCreate.push({
        employeeId: entry.employeeId,
        date: entry.date,
        checkIn: checkIn,
        checkOut: checkOut,
        status: status,
        lateMinutes: calc.lateMinutes,
        mode: 'Fingerprint',
        shiftStart,
        shiftEnd,
        gracePeriod
      });
    }

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
            ? calculateLateness(mergedCheckIn, record.shiftStart, record.gracePeriod, record.shiftEnd, roundingConfig)
            : { lateMinutes: 0, status: 'Mangkir' };
          
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
            mode: 'Fingerprint'
          },
          create: {
            employeeId: record.employeeId,
            date: record.date,
            checkIn: record.checkIn,
            checkOut: record.checkOut,
            status: record.status,
            lateMinutes: record.lateMinutes,
            mode: 'Fingerprint'
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
    console.error(err);
    // Tandai offline jika gagal
    try {
      await prisma.device.update({
        where: { id: parseInt(id) },
        data: { status: 'OFFLINE' }
      });
    } catch (e) {}
    res.status(500).json({ success: false, message: 'Gagal menarik absen: ' + err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
        const date = new Date(Date.UTC(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate()));

        // Recalculate status based on employee's shift and overrides if not in record
        const shiftStart = record.shiftStart || emp?.shift?.startTime || '08:00';
        const gracePeriod = record.gracePeriod !== undefined ? record.gracePeriod : (emp?.shift?.gracePeriod || globalGracePeriod);
        let shiftEnd = record.shiftEnd || emp?.shift?.endTime || '17:00';

        // Apply Saturday shift protocol fallback if not stored
        if (!record.shiftEnd && date.getUTCDay() === 6) {
          const satType = emp?.shift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
          if (satType === 'HALF_DAY') {
            shiftEnd = emp?.shift?.saturdayEndTime || satCheckoutTime;
          }
        }

        const calc = checkIn
          ? calculateLateness(checkIn, shiftStart, gracePeriod, shiftEnd, roundingConfig)
          : { lateMinutes: 0, status: 'Mangkir' };
        const status = resolveStatus(checkIn, checkOut, calc.status, date, penaltyRules, shiftEnd, shiftStart);

        // Fetch existing record first to merge check-in and check-out times
        const existingRecord = await prisma.attendance.findUnique({
          where: {
            employeeId_date: {
              employeeId: employeeId,
              date: date
            }
          }
        });

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
            ? calculateLateness(mergedCheckIn, shiftStart, gracePeriod, shiftEnd, roundingConfig)
            : { lateMinutes: 0, status: 'Mangkir' };
          lateMins = calcMerged.lateMinutes;
          finalStatus = resolveStatus(mergedCheckIn, mergedCheckOut, calcMerged.status, date, penaltyRules, shiftEnd, shiftStart);
        }

        // Concurrency-safe Upsert
        await prisma.attendance.upsert({
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
            mode: 'Fingerprint'
          },
          update: {
            checkIn: mergedCheckIn || undefined,
            checkOut: mergedCheckOut || undefined,
            status: finalStatus,
            lateMinutes: lateMins,
            mode: 'Fingerprint'
          }
        });

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
    console.error('[Commit] Error:', err);
    res.status(500).json({ success: false, message: 'Gagal menyimpan data absen: ' + err.message });
  }
};

/**
 * Clear Attendance Logs from device
 */
const clearDeviceLogs = async (req, res) => {
  const { id } = req.params;

  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    console.log(`[Device] Clearing attendance logs for device ${device.name}...`);

    const zkInstance = new ZKLib(device.ipAddress, device.port, 15000, 15000);
    await zkInstance.createSocket();
    await zkInstance.clearAttendanceLog();
    await zkInstance.disconnect();

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
        ipAddress: device.ipAddress
      }),
      ipAddress: req.ip
    });

    res.json({ success: true, message: `Seluruh data log absensi di mesin ${device.name} berhasil dihapus.` });
  } catch (err) {
    console.error('[Device] clearDeviceLogs error:', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus log mesin: ' + err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
