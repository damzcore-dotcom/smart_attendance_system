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
          const zkInstance = new ZKLib(device.ipAddress, device.port, 5000, 4000);
          await zkInstance.createSocket();
          const logs = await zkInstance.getAttendances();
          await zkInstance.disconnect();

          if (!logs || !logs.data || logs.data.length === 0) {
            console.log(`[Cron] No new logs found for device ID: ${device.id}`);
            continue;
          }

          const employees = await prisma.employee.findMany({ include: { shift: true } });
          const empByCode = {};
          employees.forEach(e => {
            if (e.idNumber) empByCode[e.idNumber] = e;
          });

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
            const pinStr = String(log.deviceUserId);
            const recordTime = new Date(log.recordTime);
            
            // Skip records older than cutoff (yesterday and before)
            if (recordTime < cutoffTime) continue;

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

          const recordsToCreate = [];
          for (const entry of Object.values(grouped)) {
            const emp = entry.employee;
            const shiftStart = emp.shift?.startTime || '08:00';
            const gracePeriod = emp.shift?.gracePeriod || 15;
            
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
