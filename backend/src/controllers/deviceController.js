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
  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const zkInstance = new ZKLib(device.ipAddress, device.port, 10000, 4000);
    await zkInstance.createSocket();
    const logs = await zkInstance.getAttendances();
    await zkInstance.disconnect();

    let saved = 0;
    
    // Mengelompokkan absen berdasarkan User (PIN) dan Tanggal
    for (const log of logs.data) {
      const pinStr = String(log.deviceUserId);
      const recordTime = new Date(log.recordTime);
      const dateOnly = new Date(recordTime);
      dateOnly.setHours(0, 0, 0, 0);

      // Cari Karyawan
      const emp = await prisma.employee.findFirst({ where: { idNumber: pinStr } });
      if (!emp) continue; // Skip jika belum didaftarkan di sistem (atau belum di syncUsers)

      // Cek apakah absensi hari tersebut sudah ada
      let attendance = await prisma.attendance.findUnique({
        where: {
          employeeId_date: {
            employeeId: emp.id,
            date: dateOnly
          }
        }
      });

      if (!attendance) {
        // Buat baru sebagai CHECK IN
        await prisma.attendance.create({
          data: {
            employeeId: emp.id,
            date: dateOnly,
            checkIn: recordTime,
            status: 'PRESENT',
            mode: 'Fingerprint'
          }
        });
        saved++;
      } else {
        // Jika sudah ada, jadikan CHECK OUT (jika waktu lebih baru dari checkIn)
        if (!attendance.checkOut && attendance.checkIn < recordTime) {
          await prisma.attendance.update({
            where: { id: attendance.id },
            data: { checkOut: recordTime, mode: 'Fingerprint' }
          });
          saved++;
        } else if (attendance.checkOut && attendance.checkOut < recordTime) {
          // Update check out ke waktu paling akhir
          await prisma.attendance.update({
            where: { id: attendance.id },
            data: { checkOut: recordTime, mode: 'Fingerprint' }
          });
          saved++;
        }
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
