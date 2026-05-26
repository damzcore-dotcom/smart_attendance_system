const prisma = require('../prismaClient');
const ZKLib = require('node-zklib');

/**
 * Get all devices
 */
const getDevices = async (req, res) => {
  try {
    const devices = await prisma.device.findMany({
      include: { location: true },
    });
    // Pre-seed some default deviceUsers _count if needed, but not strictly required
    res.json({ success: true, data: devices });
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
    const device = await prisma.device.create({
      data: { name, ipAddress, port: parseInt(port) || 4370, locationId: locationId ? parseInt(locationId) : null }
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
    await prisma.device.delete({ where: { id: parseInt(id) } });
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
    
    if (id) {
      await prisma.device.update({
        where: { id: parseInt(id) },
        data: { status: 'ONLINE' }
      });
    }
    
    res.json({ success: true, message: 'Koneksi berhasil!', info });
  } catch (err) {
    if (id) {
      try {
        await prisma.device.update({
          where: { id: parseInt(id) },
          data: { status: 'OFFLINE' }
        });
      } catch (e) {}
    }
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

    // Preload all unlinked employees for fuzzy matching
    const unlinkedEmployees = await prisma.employee.findMany({
      where: { 
        OR: [
          { fingerPrintId: null },
          { fingerPrintId: '' }
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
    const employees = await prisma.employee.findMany({ include: { shift: true } });
    const empByFingerPrint = {};
    const empByCode = {};
    employees.forEach(e => {
      if (e.fingerPrintId) empByFingerPrint[e.fingerPrintId.trim()] = e;
      if (e.employeeCode) empByCode[e.employeeCode.trim()] = e;
      if (e.idNumber) empByCode[e.idNumber.trim()] = e;
    });

    const { calculateLateness, resolveStatus } = require('../utils/lateCalculator');
    
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
        grouped[key] = { employeeId: emp.id, employee: emp, date: new Date(dateKey + 'T00:00:00.000Z'), scans: [] };
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
    const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
    const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
    
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
        const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        overrideMap.set(`${ov.employeeId}_${dStr}`, ov.shift);
        d.setDate(d.getDate() + 1);
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
      const gracePeriod = effectiveShift?.gracePeriod || 15;
      
      // Override shiftEnd untuk hari Sabtu jika half-day aktif
      const dayOfWeek = entry.date.getUTCDay(); // 0=Sun, 6=Sat
      if (dayOfWeek === 6 && isSaturdayHalfDay) {
        shiftEnd = satCheckoutTime; // e.g. '13:00'
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
        const shiftEndMinutes = endH * 60 + endM;
        const midpointMinutes = Math.floor((shiftStartMinutes + shiftEndMinutes) / 2);
        // e.g. Senin-Jumat 08:00-17:00 → midpoint = 12:30
        // e.g. Sabtu       08:00-12:00 → midpoint = 10:00
        
        const scanHour = earliest.getHours();
        const scanMinute = earliest.getMinutes();
        const scanMinutes = scanHour * 60 + scanMinute;
        
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
        ? calculateLateness(checkIn, shiftStart, gracePeriod)
        : { lateMinutes: 0, status: 'Mangkir' };
      
      // Resolve status using updated logic
      const status = resolveStatus(checkIn, checkOut, calc.status);

      recordsToCreate.push({
        employeeId: entry.employeeId,
        date: entry.date,
        checkIn: checkIn,
        checkOut: checkOut,
        status: status,
        lateMinutes: calc.lateMinutes,
        mode: 'Fingerprint'
      });
    }

    // Check if it's just a preview request
    const isPreview = req.query.preview === 'true';

    if (isPreview) {
      // Map back to a friendlier format for frontend display
      // Include employeeId so the frontend can send it back for direct commit
      const previewData = recordsToCreate.map(r => {
        const emp = empByCode[r.employeeId] || employees.find(e => e.id === r.employeeId);
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

        if (existingRecord) {
          // Merge times:
          // checkIn should be the earliest of (existing.checkIn, new.checkIn)
          // checkOut should be the latest of (existing.checkOut, new.checkOut)
          let finalCheckIn = existingRecord.checkIn;
          if (record.checkIn) {
            finalCheckIn = finalCheckIn 
              ? (record.checkIn < finalCheckIn ? record.checkIn : finalCheckIn) 
              : record.checkIn;
          }

          let finalCheckOut = existingRecord.checkOut;
          if (record.checkOut) {
            finalCheckOut = finalCheckOut 
              ? (record.checkOut > finalCheckOut ? record.checkOut : finalCheckOut) 
              : record.checkOut;
          }

          // Recalculate status and lateness based on merged times
          const emp = empByCode[record.employeeId] || employees.find(e => e.id === record.employeeId);
          const shiftStart = emp?.shift?.startTime || '08:00';
          const gracePeriod = emp?.shift?.gracePeriod || 15;
          
          const calc = finalCheckIn 
            ? calculateLateness(finalCheckIn, shiftStart, gracePeriod)
            : { lateMinutes: 0, status: 'Mangkir' };
          
          const finalStatus = resolveStatus(finalCheckIn, finalCheckOut, calc.status);

          await prisma.attendance.update({
            where: { id: existingRecord.id },
            data: {
              checkIn: finalCheckIn,
              checkOut: finalCheckOut,
              status: finalStatus,
              lateMinutes: calc.lateMinutes,
              mode: 'Fingerprint'
            }
          });
        } else {
          // No existing record, create a new one directly
          await prisma.attendance.create({
            data: record
          });
        }
        saved++;
      } catch (e) {
        console.error(`[Sync] Failed record for emp ${record.employeeId}:`, e.message);
      }
    }

    // Update last sync time
    await prisma.device.update({
      where: { id: parseInt(id) },
      data: { lastSync: new Date(), status: 'ONLINE' }
    });

    res.json({ success: true, message: `Sinkronisasi Absen berhasil. ${saved} record absen diperbarui. (Terbaik dari ${allAttemptCounts.length}x percobaan: [${allAttemptCounts.join(', ')}] log)` });
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
    
    const device = await prisma.device.update({
      where: { id: parseInt(id) },
      data: {
        name,
        ipAddress,
        port: parseInt(port) || 4370,
        locationId: locationId ? parseInt(locationId) : null,
        autoSyncEnabled: !!autoSyncEnabled,
        autoSyncTime: autoSyncTime || null
      }
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
  const { records } = req.body; // Array of preview records from frontend

  console.log(`[Commit] Saving ${records?.length || 0} attendance records for device ID: ${id}`);

  try {
    if (!records || records.length === 0) {
      return res.json({ success: true, message: 'Tidak ada data untuk disimpan.' });
    }

    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const { calculateLateness, resolveStatus } = require('../utils/lateCalculator');
    const employees = await prisma.employee.findMany({ include: { shift: true } });
    const empMap = {};
    employees.forEach(e => { empMap[e.id] = e; });

    let saved = 0;
    let failed = 0;

    for (const record of records) {
      try {
        const employeeId = record.employeeId;
        const checkIn = record.checkIn ? new Date(record.checkIn) : null;
        const checkOut = record.checkOut ? new Date(record.checkOut) : null;

        if (!employeeId) {
          console.warn(`[Commit] Skipping record with no employeeId`);
          failed++;
          continue;
        }

        // Normalize date to UTC midnight for @db.Date compatibility
        // This ensures consistent matching with the @@unique([employeeId, date]) constraint
        const rawDate = new Date(record.date);
        const date = new Date(Date.UTC(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate()));

        // Recalculate status based on employee's shift
        const emp = empMap[employeeId];
        const shiftStart = emp?.shift?.startTime || '08:00';
        const gracePeriod = emp?.shift?.gracePeriod || 15;

        const calc = checkIn
          ? calculateLateness(checkIn, shiftStart, gracePeriod)
          : { lateMinutes: 0, status: 'Mangkir' };
        const status = resolveStatus(checkIn, checkOut, calc.status);

        // Use upsert to handle both new and existing records atomically
        // This avoids the race condition of findUnique + create/update
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
            checkIn,
            checkOut,
            status,
            lateMinutes: calc.lateMinutes,
            mode: 'Fingerprint'
          },
          update: {
            checkIn: checkIn || undefined,
            checkOut: checkOut || undefined,
            status,
            lateMinutes: calc.lateMinutes,
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

module.exports = {
  getDevices,
  addDevice,
  updateDevice,
  deleteDevice,
  testConnection,
  syncUsers,
  syncAttendance,
  commitAttendance,
  getDeviceStats
};
