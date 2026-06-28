const cron = require('node-cron');
const prisma = require('../prismaClient');
const ZKLib = require('node-zklib');
const { calculateLateness, resolveStatus, parsePenaltySettings } = require('./lateCalculator');
const deviceSync = require('./deviceSync');
const backupService = require('./backupService');

// Runs every minute to check if any device needs auto-sync (agar jam non-kelipatan-5, mis. 08:09, tetap terpicu)
const { materializeYesterday } = require('./attendanceMaintenance');

// Recalc status absensi untuk satu rentang tanggal (reuse handler recalculate via stub req/res),
// agar PRESENT-tanpa-pulang otomatis menjadi MANGKIR (rule-3) setelah shift berakhir.
const recalcRange = async (startDate, endDate) => {
  const { recalculate } = require('../controllers/attendanceController');
  return new Promise((resolve) => {
    const req = { body: { startDate, endDate } };
    const res = {
      json: (payload) => resolve(payload),
      status: () => ({ json: (payload) => resolve(payload) }),
    };
    recalculate(req, res).catch((e) => resolve({ success: false, message: e.message }));
  });
};

const startCronJobs = () => {
  // Backup otomatis terjadwal — diperiksa tiap menit, menulis file saat jam cocok.
  cron.schedule('* * * * *', async () => {
    try {
      await backupService.runScheduledBackupIfDue(new Date());
    } catch (err) {
      console.error('[Cron] Scheduled backup check failed:', err.message);
    }
  });

  // Materialisasi absen kemarin — sekali sehari pukul 01:05 (WIB).
  cron.schedule('5 1 * * *', async () => {
    try {
      const r = await materializeYesterday();
      console.log(`[Cron] Materialisasi absen ${r.date}: dibuat ${r.created} ABSENT (libur=${!r.isWorkday}, cuti=${r.leaves}).`);
    } catch (err) {
      console.error('[Cron] Materialisasi absen gagal:', err.message);
    }
  });

  // Recalc status harian pukul 23:30 (WIB) — finalkan PRESENT-tanpa-pulang → MANGKIR setelah shift,
  // dan menit-telat mengikuti shift terbaru. Mencakup hari ini + kemarin (jaga-jaga shift malam).
  cron.schedule('30 23 * * *', async () => {
    try {
      const today = new Date();
      const yest = new Date(today); yest.setDate(yest.getDate() - 1);
      const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const r = await recalcRange(fmt(yest), fmt(today));
      console.log(`[Cron] Recalc status harian: ${r?.message || 'selesai'}`);
    } catch (err) {
      console.error('[Cron] Recalc harian gagal:', err.message);
    }
  });

  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const currentHourStr = now.getHours().toString().padStart(2, '0');
      const currentMinuteStr = now.getMinutes().toString().padStart(2, '0');
      const currentTimeStr = `${currentHourStr}:${currentMinuteStr}`;

      const devices = await prisma.device.findMany({
        where: {
          autoSyncEnabled: true,
          autoSyncTime: currentTimeStr
        }
      });

      if (devices.length === 0) return;

      console.log(`[Cron] Found ${devices.length} device(s) scheduled for auto-sync at ${currentTimeStr}`);

      for (const device of devices) {
        console.log(`[Cron] Auto-syncing attendance for device ID: ${device.id} (${device.name})`);
        try {
          const zkInstance = new ZKLib(device.ipAddress, device.port, 60000, 30000);
          await zkInstance.createSocket();
          const logs = await zkInstance.getAttendances();
          await zkInstance.disconnect();

          if (!logs || !logs.data || logs.data.length === 0) {
            console.log(`[Cron] No new logs found for device ID: ${device.id}`);
            continue;
          }

          // Karyawan non-BHL + indeks pencocokan PIN (logika bersama deviceSync)
          const employees = await prisma.employee.findMany({
            where: deviceSync.nonBhlWhere(),
            include: { shift: true }
          });
          const index = deviceSync.buildEmployeeIndex(employees);

          const settingsList = await prisma.settings.findMany();
          const syncSettings = deviceSync.loadSyncSettings(settingsList);

          // Cutoff incremental: proses log sejak last sync atau sejak awal hari (mana yang lebih baru)
          const lastSyncDate = device.lastSync ? new Date(device.lastSync) : null;
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const cutoffTime = lastSyncDate && lastSyncDate > todayStart ? lastSyncDate : todayStart;
          console.log(`[Cron] Filtering logs newer than: ${cutoffTime.toISOString()}`);

          // Override roster untuk rentang yang diproses (agar konsisten dgn tarik absensi manual)
          const overrides = await prisma.employeeShiftOverride.findMany({
            where: { startDate: { lte: new Date() }, endDate: { gte: cutoffTime } },
            include: { shift: true }
          });
          const overrideMap = deviceSync.buildOverrideMap(overrides);

          const { records: recordsToCreate } = deviceSync.buildAttendanceRecords({
            logs, index, overrideMap, settings: syncSettings, filterStart: cutoffTime, filterEnd: null
          });

          const result = await deviceSync.persistAttendanceRecords(recordsToCreate, syncSettings);
          const saved = result.saved;

          await prisma.device.update({
            where: { id: device.id },
            data: { lastSync: new Date(), status: 'ONLINE' }
          });
          
          console.log(`[Cron] Auto-sync completed for device ID: ${device.id}. Saved ${saved} records.`);

          // Record auto-sync success in AuditLog
          await prisma.auditLog.create({
            data: {
              userId: 0,
              username: 'System (Auto-Sync)',
              role: 'SYSTEM',
              action: 'SYNC',
              entity: 'Device',
              entityId: device.id,
              details: JSON.stringify({
                message: `Auto-sync completed successfully`,
                recordsSaved: saved,
                device: device.name
              }),
              ipAddress: device.ipAddress || '127.0.0.1'
            }
          });

        } catch (err) {
          console.error(`[Cron] Error auto-syncing device ID: ${device.id}`, err);
          await prisma.device.update({
            where: { id: device.id },
            data: { status: 'OFFLINE' }
          });

          // Record auto-sync connection failure in AuditLog
          try {
            await prisma.auditLog.create({
              data: {
                userId: 0,
                username: 'System (Auto-Sync)',
                role: 'SYSTEM',
                action: 'TEST_CONNECTION',
                entity: 'Device',
                entityId: device.id,
                details: JSON.stringify({
                  status: 'FAILED',
                  message: `Auto-sync failed: ${err.message}`,
                  device: device.name
                }),
                ipAddress: device.ipAddress || '127.0.0.1'
              }
            });
          } catch (logErr) {
            console.error('[Cron] Failed to record auto-sync failure audit log:', logErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[Cron] Error in auto-sync scheduler:', err);
    }
  });

  // Run daily at 01:00 AM to clean up files from rejected claims and profile requests older than 30 days
  cron.schedule('0 1 * * *', async () => {
    console.log('[Cron] Running rejected files cleanup job...');
    try {
      const { validateSafePath } = require('../middleware/validate');
      const fs = require('fs');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // 1. Cleanup ReimbursementClaim rejected receipts
      const rejectedClaims = await prisma.reimbursementClaim.findMany({
        where: {
          status: 'REJECTED',
          updatedAt: { lte: thirtyDaysAgo }
        }
      });

      console.log(`[Cron] Found ${rejectedClaims.length} rejected claim(s) older than 30 days for cleanup.`);

      for (const claim of rejectedClaims) {
        if (claim.receiptUrl && claim.receiptUrl !== 'deleted') {
          const { safe, resolvedPath } = validateSafePath(claim.receiptUrl);
          if (safe && fs.existsSync(resolvedPath)) {
            try {
              fs.unlinkSync(resolvedPath);
              console.log(`[Cron] Deleted rejected claim receipt: ${resolvedPath}`);
            } catch (e) {
              console.error(`[Cron] Error deleting file ${resolvedPath}:`, e.message);
            }
          }
          await prisma.reimbursementClaim.update({
            where: { id: claim.id },
            data: { receiptUrl: 'deleted' }
          });
        }
      }

      // 2. Cleanup ProfileUpdateRequest rejected documents
      const rejectedRequests = await prisma.profileUpdateRequest.findMany({
        where: {
          status: 'REJECTED',
          updatedAt: { lte: thirtyDaysAgo }
        }
      });

      console.log(`[Cron] Found ${rejectedRequests.length} rejected profile request(s) older than 30 days for cleanup.`);
      for (const req of rejectedRequests) {
        if (req.documentUrl && req.documentUrl !== 'deleted') {
          const { safe, resolvedPath } = validateSafePath(req.documentUrl);
          if (safe && fs.existsSync(resolvedPath)) {
            try {
              fs.unlinkSync(resolvedPath);
              console.log(`[Cron] Deleted rejected request document: ${resolvedPath}`);
            } catch (e) {
              console.error(`[Cron] Error deleting file ${resolvedPath}:`, e.message);
            }
          }
          await prisma.profileUpdateRequest.update({
            where: { id: req.id },
            data: { documentUrl: 'deleted' }
          });
        }
      }

    } catch (err) {
      console.error('[Cron] Error in rejected files cleanup job:', err);
    }
  });

  // Run daily at 08:00 AM to notify about PKWT contracts expiring in exactly 30 days
  cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] Checking for expiring PKWT contracts...');
    try {
      const { sendWAMessage } = require('../services/whatsappService');
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 30);
      
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const expiringEmployees = await prisma.employee.findMany({
        where: {
          contractEnd: {
            gte: startOfDay,
            lte: endOfDay
          },
          status: 'ACTIVE'
        }
      });
      
      console.log(`[Cron] Found ${expiringEmployees.length} employees with contract ending on ${startOfDay.toLocaleDateString()}`);
      
      for (const emp of expiringEmployees) {
        const formattedEnd = new Date(emp.contractEnd).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        
        // Send WhatsApp to Employee
        if (emp.phone) {
          const empMsg = `*Smart HRIS Platform - Pengingat Masa Kontrak PKWT*\n\n` +
            `Halo ${emp.name},\n\n` +
            `Kami ingin menginformasikan bahwa kontrak kerja PKWT Anda akan berakhir dalam waktu 30 hari lagi, yaitu pada tanggal *${formattedEnd}*.\n\n` +
            `Silakan hubungi bagian HRD untuk informasi lebih lanjut mengenai status perpanjangan kontrak Anda.\n\n` +
            `Terima kasih,\nTim HRD Smart HRIS Platform`;
          
          await sendWAMessage(emp.phone, empMsg).catch(err => {
            console.error(`[Cron] Failed to send WA to employee ${emp.name}:`, err);
          });
        }
        
        // Send WhatsApp to HRD/Admin (all admin/super_admin users with phone numbers)
        const admins = await prisma.user.findMany({
          where: {
            role: { in: ['ADMIN', 'SUPER_ADMIN'] },
            employeeId: { not: null },
            employee: {
              phone: { not: null }
            }
          },
          include: { employee: true }
        });
        
        for (const admin of admins) {
          if (admin.employee && admin.employee.phone) {
            const adminMsg = `*Smart HRIS Platform - Notifikasi Masa Kontrak Karyawan*\n\n` +
              `Halo HRD (Admin),\n\n` +
              `Menginfokan bahwa kontrak kerja PKWT untuk karyawan berikut akan berakhir dalam 30 hari:\n` +
              `• Nama: ${emp.name}\n` +
              `• NIK Karyawan: ${emp.employeeCode}\n` +
              `• Divisi/Jabatan: ${emp.division || '-'}/${emp.position || '-'}\n` +
              `• Tanggal Berakhir: *${formattedEnd}*\n\n` +
              `Harap segera memproses tindak lanjut kontrak karyawan tersebut.\n\n` +
              `Terima kasih,\nSistem Otomasi Smart HRIS Platform`;
            
            await sendWAMessage(admin.employee.phone, adminMsg).catch(err => {
              console.error(`[Cron] Failed to send WA to admin ${admin.username}:`, err);
            });
          }
        }
      }
    } catch (err) {
      console.error('[Cron] Error checking expiring PKWT contracts:', err);
    }
  });
};

module.exports = { startCronJobs };
