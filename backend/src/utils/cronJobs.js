const cron = require('node-cron');
const prisma = require('../prismaClient');
const ZKLib = require('node-zklib');
const { calculateLateness, resolveStatus, parsePenaltySettings } = require('./lateCalculator');

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
          const zkInstance = new ZKLib(device.ipAddress, device.port, 60000, 30000);
          await zkInstance.createSocket();
          const logs = await zkInstance.getAttendances();
          await zkInstance.disconnect();

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

          // Only process logs from today (auto-sync is daily, no need to reprocess old data)
          // lastSync is used as a cutoff: process logs since last sync or since start of today
          const lastSyncDate = device.lastSync ? new Date(device.lastSync) : null;
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          // Use the later of: start of today OR last sync time
          const cutoffTime = lastSyncDate && lastSyncDate > todayStart ? lastSyncDate : todayStart;

          console.log(`[Cron] Filtering logs newer than: ${cutoffTime.toISOString()}`);

          const grouped = {};
          for (const log of logs.data) {
            const pinStr = String(log.deviceUserId).trim();
            const recordTime = new Date(log.recordTime);
            
            // Skip records older than cutoff (yesterday and before)
            if (recordTime < cutoffTime) continue;

            // Extract local date components to avoid timezone shifting
            const year = recordTime.getFullYear();
            const month = String(recordTime.getMonth() + 1).padStart(2, '0');
            const day = String(recordTime.getDate()).padStart(2, '0');
            const dateKey = `${year}-${month}-${day}`;
            
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
            const empShift = emp.shift || null;
            const shiftStart = empShift?.startTime || '08:00';
            let shiftEnd = empShift?.endTime || '17:00';
            const gracePeriod = empShift ? empShift.gracePeriod : globalGracePeriod;
            
            // Override shiftEnd for Saturday if Saturday protocols match
            const dayOfWeek = entry.date.getUTCDay(); // 0=Sun, 6=Sat
            if (dayOfWeek === 6) {
              const satType = empShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
              if (satType === 'HALF_DAY') {
                shiftEnd = empShift?.saturdayEndTime || satCheckoutTime;
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
                checkIn = earliest;
                checkOut = null;
              } else {
                checkIn = null;
                checkOut = earliest;
              }
            } else {
              checkIn = earliest;
              checkOut = latest;
            }
            
            const calc = checkIn 
              ? calculateLateness(checkIn, shiftStart, gracePeriod, shiftEnd, roundingConfig)
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
                const isManual = existing.mode === 'Manual' || 
                                 existing.mode === 'Manual (SPL)' || 
                                 existing.mode === 'Manual (BHL)' || 
                                 (existing.notes && existing.notes.includes('HRD'));
                if (isManual) {
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
                  ? calculateLateness(mergedCheckIn, record.shiftStart, record.gracePeriod, record.shiftEnd, roundingConfig)
                  : { lateMinutes: 0, status: 'MANGKIR' };
                const mergedStatus = resolveStatus(mergedCheckIn, mergedCheckOut, calcMerged.status, record.date, penaltyRules, record.shiftEnd, record.shiftStart);

                await prisma.attendance.update({
                  where: { id: existing.id },
                  data: {
                    checkIn: mergedCheckIn,
                    checkOut: mergedCheckOut,
                    status: mergedStatus,
                    lateMinutes: calcMerged.lateMinutes,
                    mode: 'Fingerprint',
                    shiftStart: record.shiftStart,
                    shiftEnd: record.shiftEnd,
                    gracePeriod: record.gracePeriod
                  }
                });
              } else {
                await prisma.attendance.create({
                  data: record
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
};

module.exports = { startCronJobs };
