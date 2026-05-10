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
  const { ipAddress, port } = req.body;
  
  try {
    const zkInstance = new ZKLib(ipAddress, port || 4370, 10000, 4000);
    await zkInstance.createSocket();
    
    // Test if we can read info
    const info = await zkInstance.getInfo();
    await zkInstance.disconnect();
    
    res.json({ success: true, message: 'Koneksi berhasil!', info });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menghubungi mesin. Pastikan IP dan Port benar dan mesin menyala.' });
  }
};

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
    let updateCount = 0;

    // Default department for new unsynced employees
    let defaultDept = await prisma.department.findFirst({ where: { name: 'General' } });
    if (!defaultDept) {
      defaultDept = await prisma.department.create({ data: { name: 'General' } });
    }

    for (const u of users.data) {
      // Pendaftaran finger dari mesin akan memiliki userId (PIN angka)
      const pinStr = String(u.userId);
      
      // Cek apakah karyawan dengan idNumber (PIN) ini sudah ada
      const existing = await prisma.employee.findFirst({ where: { idNumber: pinStr } });
      
      if (existing) {
        // Update nama jika diperlukan (opsional)
        updateCount++;
      } else {
        // Buat data karyawan baru sebagai placeholder
        // HR nanti bisa mengupdate data lengkapnya
        await prisma.employee.create({
          data: {
            employeeCode: 'FNG' + pinStr, // Prefix FNG untuk hasil sync
            name: u.name || 'User Mesin ' + pinStr,
            idNumber: pinStr, // Ini adalah kunci pencocokan absen
            email: 'user' + pinStr + '@system.local',
            departmentId: defaultDept.id,
            status: 'ACTIVE'
          }
        });
        newCount++;
      }
    }

    res.json({ success: true, message: `Sinkronisasi Karyawan berhasil. Menambahkan ${newCount} baru, ${updateCount} sudah ada.` });
  } catch (err) {
    console.error(err);
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
    const employees = await prisma.employee.findMany({
      include: { shift: true }
    });
    const empByCode = {};
    employees.forEach(e => {
      if (e.idNumber) empByCode[e.idNumber] = e;
    });

    const { calculateLateness, resolveStatus } = require('../utils/lateCalculator');
    
    // Group logs by User + Date
    const grouped = {};
    for (const log of logs.data) {
      const pinStr = String(log.deviceUserId);
      const recordTime = new Date(log.recordTime);
      const dateKey = recordTime.toISOString().split('T')[0];
      
      const emp = empByCode[pinStr];
      if (!emp) continue;

      const key = `${emp.id}|${dateKey}`;
      if (!grouped[key]) {
        grouped[key] = { employeeId: emp.id, employee: emp, date: new Date(dateKey + 'T00:00:00'), checkIn: recordTime, checkOut: recordTime };
      } else {
        if (recordTime < grouped[key].checkIn) grouped[key].checkIn = recordTime;
        if (recordTime > grouped[key].checkOut) grouped[key].checkOut = recordTime;
      }
    }

    // Process grouped records
    const recordsToCreate = [];
    const entries = Object.values(grouped);
    
    for (const entry of entries) {
      const emp = entry.employee;
      const shiftStart = emp.shift?.startTime || '08:00';
      const gracePeriod = emp.shift?.gracePeriod || 15;
      
      // Calculate Lateness
      const calc = calculateLateness(entry.checkIn, shiftStart, gracePeriod);
      const status = resolveStatus(entry.checkIn, entry.checkIn === entry.checkOut ? null : entry.checkOut, calc.status);

      recordsToCreate.push({
        employeeId: entry.employeeId,
        date: entry.date,
        checkIn: entry.checkIn,
        checkOut: entry.checkIn === entry.checkOut ? null : entry.checkOut,
        status,
        lateMinutes: calc.lateMinutes,
        mode: 'Fingerprint'
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
      where: { id: device.id },
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

module.exports = {
  getDevices,
  addDevice,
  deleteDevice,
  testConnection,
  syncUsers,
  syncAttendance
};
