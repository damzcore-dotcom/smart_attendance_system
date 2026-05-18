const prisma = require('../prismaClient');
const ZKLib = require('node-zklib');

/**
 * Get all devices
 */
const getDevices = async (req, res) => {
  try {
    const devices = await prisma.device.findMany();
    res.json({ success: true, data: devices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    const zkInstance = new ZKLib(ipAddress, port || 4370, 10000, 4000);
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
 * Sync Users (Enrollment dari Mesin ke Sistem)
 */
const syncUsers = async (req, res) => {
  const { id } = req.params; // Device ID
  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const zkInstance = new ZKLib(device.ipAddress, device.port, 10000, 4000);
    await zkInstance.createSocket();
    const users = await zkInstance.getUsers();
    await zkInstance.disconnect();

    let newCount = 0;
    let linkedCount = 0;
    let skippedCount = 0;
    const syncDetails = []; // Detail data dari mesin

    // Default department for new unsynced employees
    let defaultDept = await prisma.department.findFirst({ where: { name: 'General' } });
    if (!defaultDept) {
      defaultDept = await prisma.department.create({ data: { name: 'General' } });
    }

    // Preload all unlinked employees for fuzzy matching
    // FIX: cek BOTH null AND empty string ''
    const unlinkedEmployees = await prisma.employee.findMany({
      where: { 
        OR: [
          { fingerPrintId: null },
          { fingerPrintId: '' }
        ]
      }
    });

    for (const u of users.data) {
      // AC No. dari mesin (deviceUserId / PIN)
      const fingerPrintId = String(u.userId).trim();
      const machineName = (u.name || '').trim();
      
      // 1. Cek apakah sudah ada karyawan dengan fingerPrintId ini
      let existing = await prisma.employee.findFirst({ where: { fingerPrintId } });
      
      if (existing) {
        // Sudah terlink — skip
        skippedCount++;
        syncDetails.push({
          acNo: fingerPrintId,
          machineName,
          dbName: existing.name,
          status: 'already_linked',
          statusText: 'Sudah Terlink'
        });
        continue;
      }
      
      // 2. FUZZY NAME MATCHING — cocokkan nama mesin dengan database
      if (machineName) {
        const bestMatch = findBestNameMatch(machineName, unlinkedEmployees);
        
        if (bestMatch) {
          // Auto-link: isi fingerPrintId dari AC No. mesin
          await prisma.employee.update({
            where: { id: bestMatch.id },
            data: { fingerPrintId }
          });
          // Remove from unlinked list so it won't match again
          const idx = unlinkedEmployees.findIndex(e => e.id === bestMatch.id);
          if (idx !== -1) unlinkedEmployees.splice(idx, 1);
          linkedCount++;
          syncDetails.push({
            acNo: fingerPrintId,
            machineName,
            dbName: bestMatch.name,
            status: 'linked',
            statusText: 'Auto-Link Berhasil'
          });
          console.log(`[Sync] ✅ Linked "${machineName}" → "${bestMatch.name}" (ID: ${bestMatch.id})`);
          continue;
        }
      }
      
      // 3. Tidak ditemukan — buat karyawan baru sebagai placeholder
      await prisma.employee.create({
        data: {
          employeeCode: 'FNG' + fingerPrintId,
          name: machineName || 'User Mesin ' + fingerPrintId,
          fingerPrintId,
          email: 'user' + fingerPrintId + '@system.local',
          departmentId: defaultDept.id,
          status: 'ACTIVE'
        }
      });
      newCount++;
      syncDetails.push({
        acNo: fingerPrintId,
        machineName: machineName || 'User Mesin ' + fingerPrintId,
        dbName: '-',
        status: 'new',
        statusText: 'Karyawan Baru (Placeholder)'
      });
      console.log(`[Sync] ➕ New placeholder: "${machineName || 'User Mesin ' + fingerPrintId}" (FP: ${fingerPrintId})`);
    }

    // Update device status to ONLINE
    await prisma.device.update({
      where: { id: parseInt(id) },
      data: { status: 'ONLINE', lastSync: new Date() }
    });

    res.json({ 
      success: true, 
      message: `Sinkronisasi berhasil! ${linkedCount} auto-link, ${newCount} baru, ${skippedCount} sudah terlink.`,
      data: {
        totalMachine: users.data.length,
        linked: linkedCount,
        new: newCount,
        skipped: skippedCount,
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
 * Sync Attendance
 */
const syncAttendance = async (req, res) => {
  const { id } = req.params;
  console.log(`[Sync] Starting attendance sync for device ID: ${id}`);
  
  let zkInstance = null;
  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) {
      console.error(`[Sync] Device with ID ${id} not found`);
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    console.log(`[Sync] Connecting to device at ${device.ipAddress}:${device.port}...`);
    zkInstance = new ZKLib(device.ipAddress, device.port, 5000, 4000); // 5s timeout
    
    await zkInstance.createSocket();
    console.log(`[Sync] Socket created. Fetching logs...`);
    
    const logs = await zkInstance.getAttendances();
    console.log(`[Sync] Successfully fetched ${logs?.data?.length || 0} logs from device.`);
    
    await zkInstance.disconnect();
    console.log(`[Sync] Device disconnected. Processing records...`);

    if (!logs || !logs.data || logs.data.length === 0) {
      return res.json({ success: true, message: 'Tidak ada data log baru di mesin.' });
    }
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
    let filterEnd = new Date();
    filterEnd.setHours(23, 59, 59, 999);

    if (startDateQuery) {
      filterStart = new Date(`${startDateQuery}T00:00:00`);
    }
    if (endDateQuery) {
      filterEnd = new Date(`${endDateQuery}T23:59:59.999`);
    }

    // Group logs by User + Date — collect ALL timestamps
    const grouped = {};
    for (const log of logs.data) {
      const pinStr = String(log.deviceUserId).trim();
      const recordTime = new Date(log.recordTime);
      
      // Skip records outside of filter range
      if (recordTime < filterStart || recordTime > filterEnd) continue;

      const dateKey = recordTime.toISOString().split('T')[0];
      
      const emp = empByFingerPrint[pinStr] || empByCode[pinStr];
      if (!emp) continue;

      const key = `${emp.id}|${dateKey}`;
      if (!grouped[key]) {
        grouped[key] = { employeeId: emp.id, employee: emp, date: new Date(dateKey + 'T00:00:00'), scans: [] };
      }
      grouped[key].scans.push(recordTime);
    }

    // Process grouped records
    const recordsToCreate = [];
    const entries = Object.values(grouped);
    
    // Fetch Saturday Half-Day settings
    const settingsList = await prisma.settings.findMany();
    const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
    const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
    
    for (const entry of entries) {
      const emp = entry.employee;
      const shiftStart = emp.shift?.startTime || '08:00';
      let shiftEnd = emp.shift?.endTime || '17:00';
      const gracePeriod = emp.shift?.gracePeriod || 15;
      
      // Override shiftEnd untuk hari Sabtu jika half-day aktif
      const dayOfWeek = entry.date.getDay(); // 0=Sun, 6=Sat
      if (dayOfWeek === 6 && isSaturdayHalfDay) {
        shiftEnd = satCheckoutTime; // e.g. '13:00'
      }
      
      // Sort all scans chronologically
      entry.scans.sort((a, b) => a - b);
      
      const earliest = entry.scans[0];
      const latest = entry.scans[entry.scans.length - 1];
      
      let checkIn = null;
      let checkOut = null;
      
      if (entry.scans.length === 1) {
        // === SMART SINGLE-SCAN DETECTION ===
        // Calculate shift midpoint to determine if scan is check-in or check-out
        const [startH, startM] = shiftStart.split(':').map(Number);
        const [endH, endM] = shiftEnd.split(':').map(Number);
        const shiftStartMinutes = startH * 60 + startM;
        const shiftEndMinutes = endH * 60 + endM;
        const midpointMinutes = Math.floor((shiftStartMinutes + shiftEndMinutes) / 2);
        // e.g. Senin-Jumat 08:00-17:00 → midpoint = 12:30
        // e.g. Sabtu       08:00-13:00 → midpoint = 10:30
        
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
        : { lateMinutes: 0, status: 'Mangkir' }; // Tidak ada scan masuk = Mangkir
      
      const status = resolveStatus(checkIn, checkOut, calc.status);

      recordsToCreate.push({
        employeeId: entry.employeeId,
        date: entry.date,
        checkIn,
        checkOut,
        status,
        lateMinutes: calc.lateMinutes,
        mode: 'Fingerprint'
      });
    }

    // Check if it's just a preview request
    const isPreview = req.query.preview === 'true';

    if (isPreview) {
      // Map back to a friendlier format for frontend display
      const previewData = recordsToCreate.map(r => {
        const emp = empByCode[r.employeeId] || employees.find(e => e.id === r.employeeId);
        return {
          employeeName: emp ? emp.name : 'Unknown',
          employeeCode: emp ? emp.employeeCode : '-',
          date: r.date,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          status: r.status,
          lateMinutes: r.lateMinutes
        };
      });

      return res.json({ 
        success: true, 
        message: `Ditemukan ${recordsToCreate.length} record absen baru.`,
        data: previewData,
        rawRecords: recordsToCreate.length
      });
    }

    // Bulk Upsert (using individual upserts in a promise pool to be safest for existing data)
    // or createMany with skipDuplicates. Let's use individual upserts to ensure update works.
    let saved = 0;
    for (const record of recordsToCreate) {
      try {
        await prisma.attendance.upsert({
          where: {
            employeeId_date: {
              employeeId: record.employeeId,
              date: record.date
            }
          },
          update: {
            checkIn: record.checkIn,
            checkOut: record.checkOut,
            status: record.status,
            lateMinutes: record.lateMinutes,
            mode: 'Fingerprint'
          },
          create: record
        });
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

    res.json({ success: true, message: `Sinkronisasi Absen berhasil. ${saved} record absen diperbarui.` });
  } catch (err) {
    console.error(err);
    // Tandai offline jika gagal
    await prisma.device.update({
      where: { id: parseInt(id) },
      data: { status: 'OFFLINE' }
    });
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

module.exports = {
  getDevices,
  addDevice,
  updateDevice,
  deleteDevice,
  testConnection,
  syncUsers,
  syncAttendance
};
