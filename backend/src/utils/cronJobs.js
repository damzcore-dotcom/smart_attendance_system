const cron = require('node-cron');
const prisma = require('../prismaClient');
const ZKLib = require('node-zklib');
const zkHelper = require('./zkHelper');
const { calculateLateness, resolveStatus, parsePenaltySettings, isManualCorrection, classifyDayScans } = require('./lateCalculator');
const { adjustZkTimeToUTC, getJakartaDateKey } = require('./dateHelper');

// Runs every minute to check if any device needs auto-sync
const startCronJobs = () => {
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
          const { logs, bestCount } = await zkHelper.getAttendancesWithRetry(
            device.ipAddress, device.port, 3
          );

          if (!logs || !logs.data || logs.data.length === 0) {
            console.log(`[Cron] No new logs found for device ID: ${device.id}`);
            continue;
          }

          const employees = await prisma.employee.findMany({
            where: {
              AND: [
                {
                  OR: [
                    { employmentStatus: null },
                    { employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } }
                  ]
                },
                {
                  OR: [
                    { salaryCategory: null },
                    { salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } }
                  ]
                }
              ]
            },
            include: { shift: true }
          });

          // Fetch Overrides for all active employees within today's range (last 30 days buffer)
          const filterStart = new Date();
          filterStart.setDate(filterStart.getDate() - 30);
          filterStart.setHours(0, 0, 0, 0);
          const filterEnd = new Date();
          filterEnd.setHours(23, 59, 59, 999);

          const allOverrides = await prisma.employeeShiftOverride.findMany({
            where: {
              startDate: { lte: filterEnd },
              endDate: { gte: filterStart }
            },
            include: { shift: true }
          });

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

          const empByFingerPrint = {};
          const empByCode = {};
          employees.forEach(e => {
            if (e.fingerPrintId) empByFingerPrint[String(e.fingerPrintId).trim()] = e;
            if (e.employeeCode) empByCode[String(e.employeeCode).trim()] = e;
          });

          // Fetch Settings to check for Saturday Half-Day rules & global grace period
          const settingsList = await prisma.settings.findMany();
          const { penaltyRules, roundingConfig } = parsePenaltySettings(settingsList);
          const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
          const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';
          const globalGracePeriod = parseInt(settingsList.find(s => s.key === 'gracePeriod')?.value || '15', 10);
          const defaultShiftStart = settingsList.find(s => s.key === 'defaultShiftStart')?.value || '08:00';
          const defaultShiftEnd = settingsList.find(s => s.key === 'defaultShiftEnd')?.value || '17:00';

          // Dynamically compute cutoff based on last sync time with a 2-hour buffer.
          // Capped to a maximum of 30 days ago to keep operations performant.
          const lastSyncDate = device.lastSync ? new Date(device.lastSync) : null;
          let cutoffTime;
          if (lastSyncDate) {
            cutoffTime = new Date(lastSyncDate.getTime() - 2 * 60 * 60 * 1000); // 2 hours safety buffer
            const maxBack = new Date();
            maxBack.setDate(maxBack.getDate() - 30);
            maxBack.setHours(0, 0, 0, 0);
            if (cutoffTime < maxBack) {
              cutoffTime = maxBack;
            }
          } else {
            // Default to 7 days ago if first time sync
            cutoffTime = new Date();
            cutoffTime.setDate(cutoffTime.getDate() - 7);
            cutoffTime.setHours(0, 0, 0, 0);
          }

          console.log(`[Cron] Filtering logs newer than: ${cutoffTime.toISOString()}`);

          const timezoneOffsetSetting = settingsList.find(s => s.key === 'timezoneOffset')?.value || '420';
          const timezoneOffset = parseInt(timezoneOffsetSetting, 10);

          const grouped = {};
          for (const log of logs.data) {
            const pinStr = String(log.deviceUserId).trim();
            const recordTime = adjustZkTimeToUTC(new Date(log.recordTime), timezoneOffset);
            
            // Skip records older than cutoff (yesterday and before)
            if (recordTime < cutoffTime) continue;

            // Derive the WIB calendar date directly so grouping does not depend on the
            // server's local timezone (recordTime is already a true UTC instant).
            const dateKey = getJakartaDateKey(recordTime);
            
            const emp = empByFingerPrint[pinStr] || empByCode[pinStr];
            if (!emp) continue;

            const key = `${emp.id}|${dateKey}`;
            if (!grouped[key]) {
              grouped[key] = { employeeId: emp.id, employee: emp, date: new Date(dateKey + 'T00:00:00.000Z'), scans: [] };
            }
            grouped[key].scans.push(recordTime);
          }

          const recordsToCreate = [];
          for (const entry of Object.values(grouped)) {
            const emp = entry.employee;
            const dStr = `${entry.date.getUTCFullYear()}-${String(entry.date.getUTCMonth()+1).padStart(2,'0')}-${String(entry.date.getUTCDate()).padStart(2,'0')}`;
            const overrideShift = overrideMap.get(`${emp.id}_${dStr}`);
            const empShift = overrideShift || emp.shift || null;

            const shiftStart = empShift?.startTime || defaultShiftStart;
            let shiftEnd = empShift?.endTime || defaultShiftEnd;
            const gracePeriod = empShift ? empShift.gracePeriod : globalGracePeriod;
            
            // Override shiftEnd for Saturday if Saturday protocols match
            const dayOfWeek = entry.date.getUTCDay(); // 0=Sun, 6=Sat
            if (dayOfWeek === 6) {
              const satType = empShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
              if (satType === 'HALF_DAY') {
                shiftEnd = empShift?.saturdayEndTime || satCheckoutTime;
              }
            }
            
            // Classify masuk/pulang via the shared helper so auto-sync cron and
            // manual sync stay byte-for-byte identical (PERBAIKAN_ABSENSI.md #5).
            const { checkIn, checkOut } = classifyDayScans(entry.scans, shiftStart, shiftEnd);

            const calc = checkIn 
              ? calculateLateness(checkIn, shiftStart, gracePeriod, shiftEnd, roundingConfig, penaltyRules)
              : { lateMinutes: 0, status: 'MANGKIR' };
            
            const status = resolveStatus(checkIn, checkOut, calc.status, entry.date, penaltyRules, shiftEnd, shiftStart);

            recordsToCreate.push({
              employeeId: entry.employeeId,
              date: entry.date,
              checkIn,
              checkOut,
              status,
              lateMinutes: calc.lateMinutes,
              mode: 'Fingerprint',
              shiftStart,
              shiftEnd,
              gracePeriod
            });
          }

          let saved = 0;
          for (const record of recordsToCreate) {
            try {
              // C7 FIX: Fetch existing record to check if it was manually corrected
              const existing = await prisma.attendance.findUnique({
                where: { employeeId_date: { employeeId: record.employeeId, date: record.date } }
              });

              if (existing) {
                // If it is a manual correction by HRD, protect it and skip sync
                if (isManualCorrection(existing)) {
                  console.log(`[Cron] Skipping sync for employee ${record.employeeId} on ${record.date.toISOString().split('T')[0]} to protect manual HRD correction.`);
                  continue;
                }

                // Merge check-in/check-out: keep earliest checkIn, latest checkOut
                let mergedCheckIn = record.checkIn;
                let mergedCheckOut = record.checkOut;

                if (record.checkIn) {
                  mergedCheckIn = existing.checkIn
                    ? (record.checkIn < existing.checkIn ? record.checkIn : existing.checkIn)
                    : record.checkIn;
                } else {
                  mergedCheckIn = existing.checkIn;
                }

                if (record.checkOut) {
                  mergedCheckOut = existing.checkOut
                    ? (record.checkOut > existing.checkOut ? record.checkOut : existing.checkOut)
                    : record.checkOut;
                } else {
                  mergedCheckOut = existing.checkOut;
                }

                // Recalculate status based on merged times
                const calcMerged = mergedCheckIn
                  ? calculateLateness(mergedCheckIn, record.shiftStart, record.gracePeriod, record.shiftEnd, roundingConfig, penaltyRules)
                  : { lateMinutes: 0, status: 'MANGKIR' };
                const mergedStatus = resolveStatus(mergedCheckIn, mergedCheckOut, calcMerged.status, record.date, penaltyRules, record.shiftEnd, record.shiftStart);

                await prisma.attendance.update({
                  where: { id: existing.id },
                  data: {
                    checkIn: mergedCheckIn,
                    checkOut: mergedCheckOut,
                    status: mergedStatus,
                    lateMinutes: calcMerged.lateMinutes,
                    mode: 'Fingerprint'
                  }
                });
              } else {
                const { shiftStart, shiftEnd, gracePeriod, ...prismaRecord } = record;
                await prisma.attendance.create({
                  data: prismaRecord
                });
              }
              saved++;
            } catch (e) {
              console.error(`[Cron] Failed to save record for emp ${record.employeeId}:`, e.message);
            }
          }

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

  // 4. Auto Backup Scheduler (Runs daily at 00:00 midnight)
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Checking Auto Backup requirements...');
    try {
      const keys = ['auto_backup_enabled', 'auto_backup_schedule', 'auto_backup_last_run'];
      const settings = await prisma.settings.findMany({
        where: { key: { in: keys } }
      });

      const config = {
        auto_backup_enabled: 'false',
        auto_backup_schedule: 'daily',
        auto_backup_last_run: '-'
      };

      settings.forEach(s => {
        config[s.key] = s.value;
      });

      if (config.auto_backup_enabled !== 'true') {
        console.log('[Cron] Auto Backup is disabled.');
        return;
      }

      const now = new Date();
      let shouldBackup = false;

      if (config.auto_backup_schedule === 'daily') {
        shouldBackup = true;
      } else if (config.auto_backup_schedule === 'weekly') {
        if (now.getDay() === 0) { // Sunday
          shouldBackup = true;
        } else if (config.auto_backup_last_run !== '-') {
          const lastRun = new Date(config.auto_backup_last_run);
          const diffTime = Math.abs(now - lastRun);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays >= 7) shouldBackup = true;
        } else {
          shouldBackup = true;
        }
      } else if (config.auto_backup_schedule === 'monthly') {
        if (now.getDate() === 1) { // 1st day of month
          shouldBackup = true;
        } else if (config.auto_backup_last_run !== '-') {
          const lastRun = new Date(config.auto_backup_last_run);
          if (now.getMonth() !== lastRun.getMonth() || now.getFullYear() !== lastRun.getFullYear()) {
            shouldBackup = true;
          }
        } else {
          shouldBackup = true;
        }
      }

      if (shouldBackup) {
        console.log('[Cron] Triggering Scheduled Auto Backup...');
        const { triggerAutoBackup } = require('../controllers/backupController');
        const filename = await triggerAutoBackup();
        console.log(`[Cron] Scheduled Auto Backup completed successfully. File: ${filename}`);
      } else {
        console.log('[Cron] Scheduled Auto Backup is not due today.');
      }
    } catch (err) {
      console.error('[Cron] Error in Auto Backup scheduler:', err.message);
    }
  });
};

module.exports = { startCronJobs };
