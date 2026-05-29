const cron = require('node-cron');
const prisma = require('../prismaClient');
const ZKLib = require('node-zklib');
const { calculateLateness, resolveStatus } = require('./lateCalculator');

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

          // Fetch Settings to check for Saturday Half-Day rules
          const settingsList = await prisma.settings.findMany();
          const isSaturdayHalfDay = settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true';
          const satCheckoutTime = settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00';

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
            const shiftStart = emp.shift?.startTime || '08:00';
            let shiftEnd = emp.shift?.endTime || '17:00';
            const gracePeriod = emp.shift?.gracePeriod || 15;
            
            // Override shiftEnd for Saturday if half-day is enabled
            const dayOfWeek = entry.date.getUTCDay(); // 0=Sun, 6=Sat
            if (dayOfWeek === 6 && isSaturdayHalfDay) {
              shiftEnd = satCheckoutTime;
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
              const shiftEndMinutes = endH * 60 + endM;
              const midpointMinutes = Math.floor((shiftStartMinutes + shiftEndMinutes) / 2);
              
              const scanHour = earliest.getHours();
              const scanMinute = earliest.getMinutes();
              const scanMinutes = scanHour * 60 + scanMinute;
              
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
              ? calculateLateness(checkIn, shiftStart, gracePeriod)
              : { lateMinutes: 0, status: 'Mangkir' };
            
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

          let saved = 0;
          for (const record of recordsToCreate) {
            try {
              await prisma.attendance.upsert({
                where: { employeeId_date: { employeeId: record.employeeId, date: record.date } },
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
              console.error(`[Cron] Failed to save record for emp ${record.employeeId}:`, e.message);
            }
          }

          await prisma.device.update({
            where: { id: device.id },
            data: { lastSync: new Date(), status: 'ONLINE' }
          });
          
          console.log(`[Cron] Auto-sync completed for device ID: ${device.id}. Saved ${saved} records.`);

        } catch (err) {
          console.error(`[Cron] Error auto-syncing device ID: ${device.id}`, err);
          await prisma.device.update({
            where: { id: device.id },
            data: { status: 'OFFLINE' }
          });
        }
      }
    } catch (err) {
      console.error('[Cron] Error in auto-sync scheduler:', err);
    }
  });
};

module.exports = { startCronJobs };
