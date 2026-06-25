/**
 * Logika sinkronisasi absensi mesin (ZKTeco) yang DIPAKAI BERSAMA oleh:
 *  - Tarik Absensi manual (deviceController.syncAttendance & commitAttendance)
 *  - Auto-sync terjadwal (cronJobs)
 *  - Hapus Log Mesin (sync-dulu sebelum clear)
 *
 * Tujuan: satu sumber kebenaran agar perilaku konsisten —
 *  - Pemasangan masuk/pulang + status sama persis di semua jalur.
 *  - MERGE anti-tindih: jam masuk paling awal & pulang paling akhir.
 *  - PROTEKSI koreksi HRD / cuti-izin-sakit (tidak ditimpa sync mesin).
 *  - Label seragam: mode 'Fingerprint', source 'fingerprint'.
 */
const prisma = require('../prismaClient');
const { calculateLateness, resolveStatus, parsePenaltySettings } = require('./lateCalculator');

const MACHINE_MODE = 'Fingerprint';
const MACHINE_SOURCE = 'fingerprint';
const BHL_TOKENS = ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'];
const LEAVE_STATUSES = ['CUTI', 'IZIN', 'SAKIT', 'HOLIDAY', 'HALF_DAY'];

// Klausa where untuk mengecualikan karyawan harian/BHL dari sinkronisasi absen.
function nonBhlWhere() {
  return {
    AND: [
      { OR: [{ employmentStatus: null }, { employmentStatus: { notIn: BHL_TOKENS } }] },
      { OR: [{ salaryCategory: null }, { salaryCategory: { notIn: BHL_TOKENS } }] },
    ],
  };
}

function loadSyncSettings(settingsList) {
  const { penaltyRules, roundingConfig } = parsePenaltySettings(settingsList);
  return {
    penaltyRules,
    roundingConfig,
    isSaturdayHalfDay: settingsList.find(s => s.key === 'saturdayHalfDay')?.value === 'true',
    satCheckoutTime: settingsList.find(s => s.key === 'saturdayCheckoutTime')?.value || '13:00',
    globalGracePeriod: parseInt(settingsList.find(s => s.key === 'gracePeriod')?.value || '15', 10),
  };
}

// Indeks karyawan untuk pencocokan PIN mesin: fingerPrintId (utama) → employeeCode/idNumber (fallback).
function buildEmployeeIndex(employees) {
  const empByFingerPrint = {};
  const empByCode = {};
  const empById = {};
  for (const e of employees) {
    empById[e.id] = e;
    if (e.fingerPrintId) empByFingerPrint[String(e.fingerPrintId).trim()] = e;
    if (e.employeeCode) empByCode[String(e.employeeCode).trim()] = e;
    if (e.idNumber) empByCode[String(e.idNumber).trim()] = e;
  }
  return { empByFingerPrint, empByCode, empById };
}

// Peta override shift roster: `${employeeId}_YYYY-MM-DD` -> shift
function buildOverrideMap(overrides) {
  const map = new Map();
  for (const ov of overrides || []) {
    let d = new Date(ov.startDate);
    const endD = new Date(ov.endDate);
    while (d <= endD) {
      const dStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      map.set(`${ov.employeeId}_${dStr}`, ov.shift);
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return map;
}

/**
 * Bangun record absensi dari log mentah mesin.
 * @returns {{ records: Array, diagnostics: object }}
 */
function buildAttendanceRecords({ logs, index, overrideMap, settings, filterStart = null, filterEnd = null }) {
  const { empByFingerPrint, empByCode } = index;
  const { penaltyRules, roundingConfig, isSaturdayHalfDay, satCheckoutTime, globalGracePeriod } = settings;

  const grouped = {};
  let totalLogs = 0;
  let logsInRange = 0;
  let logsMatched = 0;
  const unmatchedPins = new Map();

  for (const log of (logs?.data || [])) {
    totalLogs++;
    const recordTime = new Date(log.recordTime);
    if (isNaN(recordTime.getTime())) continue;
    if (filterStart && recordTime < filterStart) continue;
    if (filterEnd && recordTime > filterEnd) continue;
    logsInRange++;

    const pinStr = String(log.deviceUserId).trim();
    // Pakai komponen tanggal LOKAL agar scan pagi tak tergeser ke hari sebelumnya (bug UTC).
    const year = recordTime.getFullYear();
    const month = String(recordTime.getMonth() + 1).padStart(2, '0');
    const day = String(recordTime.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    const emp = empByFingerPrint[pinStr] || empByCode[pinStr];
    if (!emp) {
      if (!unmatchedPins.has(pinStr)) unmatchedPins.set(pinStr, log.userName || log.name || `User PIN ${pinStr}`);
      continue;
    }
    logsMatched++;

    const key = `${emp.id}|${dateKey}`;
    if (!grouped[key]) {
      const [gy, gm, gd] = dateKey.split('-').map(Number);
      grouped[key] = { employeeId: emp.id, employee: emp, date: new Date(Date.UTC(gy, gm - 1, gd, 0, 0, 0, 0)), scans: [] };
    }
    const verifyMode = log.verifyMode !== undefined ? log.verifyMode : 1;
    grouped[key].scans.push({ time: recordTime, verifyMode });
  }

  const records = [];
  for (const entry of Object.values(grouped)) {
    const emp = entry.employee;
    const dStr = `${entry.date.getUTCFullYear()}-${String(entry.date.getUTCMonth() + 1).padStart(2, '0')}-${String(entry.date.getUTCDate()).padStart(2, '0')}`;
    const overrideShift = overrideMap ? overrideMap.get(`${emp.id}_${dStr}`) : null;
    const effectiveShift = overrideShift || emp.shift || null;

    const shiftStart = effectiveShift?.startTime || '08:00';
    let shiftEnd = effectiveShift?.endTime || '17:00';
    const gracePeriod = effectiveShift ? effectiveShift.gracePeriod : globalGracePeriod;

    if (entry.date.getUTCDay() === 6) {
      const satType = effectiveShift?.saturdayType || (isSaturdayHalfDay ? 'HALF_DAY' : 'FULL_DAY');
      if (satType === 'HALF_DAY') shiftEnd = effectiveShift?.saturdayEndTime || satCheckoutTime;
    }

    entry.scans.sort((a, b) => a.time - b.time);
    const earliestScan = entry.scans[0];
    const latestScan = entry.scans[entry.scans.length - 1];
    const earliest = earliestScan.time;
    const latest = latestScan.time;

    let checkIn = null;
    let checkOut = null;
    const timeDiffMinutes = (latest - earliest) / (1000 * 60);
    const isSingleScan = entry.scans.length === 1 || timeDiffMinutes < 60;

    if (isSingleScan) {
      const [sH, sM] = shiftStart.split(':').map(Number);
      const [eH, eM] = shiftEnd.split(':').map(Number);
      const startMin = sH * 60 + sM;
      let endMin = eH * 60 + eM;
      if (endMin < startMin) endMin += 24 * 60; // shift malam lintas tengah malam
      const midpoint = Math.floor((startMin + endMin) / 2);
      let scanMin = earliest.getHours() * 60 + earliest.getMinutes();
      if (endMin > 1440 && scanMin < startMin - 6 * 60) scanMin += 24 * 60;
      if (scanMin <= midpoint) checkIn = earliest; else checkOut = earliest;
    } else {
      checkIn = earliest;
      checkOut = latest;
    }

    const calc = checkIn
      ? calculateLateness(checkIn, shiftStart, gracePeriod, shiftEnd, roundingConfig)
      : { lateMinutes: 0, status: 'MANGKIR' };
    const status = resolveStatus(checkIn, checkOut, calc.status, entry.date, penaltyRules, shiftEnd, shiftStart);

    let finalMode = MACHINE_MODE;
    const vm = earliestScan.verifyMode;
    if (vm === 0 || vm === 3 || vm === 4) finalMode = 'Pinned';
    else if (vm === 2) finalMode = 'Carded';
    else if (vm === 15) finalMode = 'Face Machine';

    records.push({
      employeeId: entry.employeeId,
      date: entry.date,
      checkIn,
      checkOut,
      status,
      lateMinutes: calc.lateMinutes,
      mode: finalMode,
      shiftStart,
      shiftEnd,
      gracePeriod,
    });
  }

  return { records, diagnostics: { totalLogs, logsInRange, logsMatched, unmatchedPins } };
}

// Record yang TIDAK boleh ditimpa sync mesin: koreksi manual HRD atau status cuti/izin/sakit.
function isProtected(existing) {
  if (!existing) return false;
  if (existing.mode === 'Manual' || existing.mode === 'Manual (SPL)' || existing.mode === 'Manual (BHL)') return true;
  if (existing.notes && existing.notes.includes('HRD')) return true;
  if (LEAVE_STATUSES.includes(existing.status)) return true;
  return false;
}

/**
 * Simpan record ke DB dengan MERGE (masuk paling awal, pulang paling akhir),
 * proteksi HRD/cuti, dan label seragam. Aman dipanggil dari semua jalur.
 * @returns {{ saved:number, skipped:number, failed:number, employeeCount:number }}
 */
async function persistAttendanceRecords(records, { penaltyRules, roundingConfig }) {
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  const savedEmployees = new Set();

  for (const record of records) {
    try {
      const existing = await prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId: record.employeeId, date: record.date } },
      });

      if (isProtected(existing)) {
        skipped++;
        continue;
      }

      const recIn = record.checkIn ? new Date(record.checkIn) : null;
      const recOut = record.checkOut ? new Date(record.checkOut) : null;

      let mergedCheckIn = recIn;
      let mergedCheckOut = recOut;
      let finalStatus = record.status;
      let lateMins = record.lateMinutes;

      if (existing) {
        mergedCheckIn = recIn
          ? (existing.checkIn ? (recIn < existing.checkIn ? recIn : existing.checkIn) : recIn)
          : existing.checkIn;
        mergedCheckOut = recOut
          ? (existing.checkOut ? (recOut > existing.checkOut ? recOut : existing.checkOut) : recOut)
          : existing.checkOut;

        const calc = mergedCheckIn
          ? calculateLateness(mergedCheckIn, record.shiftStart, record.gracePeriod, record.shiftEnd, roundingConfig)
          : { lateMinutes: 0, status: 'MANGKIR' };
        lateMins = calc.lateMinutes;
        finalStatus = resolveStatus(mergedCheckIn, mergedCheckOut, calc.status, record.date, penaltyRules, record.shiftEnd, record.shiftStart);
      }

      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: record.employeeId, date: record.date } },
        update: { checkIn: mergedCheckIn, checkOut: mergedCheckOut, status: finalStatus, lateMinutes: lateMins, mode: record.mode || MACHINE_MODE, source: MACHINE_SOURCE },
        create: { employeeId: record.employeeId, date: record.date, checkIn: recIn, checkOut: recOut, status: record.status, lateMinutes: record.lateMinutes, mode: record.mode || MACHINE_MODE, source: MACHINE_SOURCE },
      });
      saved++;
      savedEmployees.add(record.employeeId);
    } catch (e) {
      failed++;
      console.error(`[DeviceSync] Gagal simpan record emp ${record.employeeId}:`, e.message);
    }
  }

  return { saved, skipped, failed, employeeCount: savedEmployees.size };
}

module.exports = {
  MACHINE_MODE,
  MACHINE_SOURCE,
  BHL_TOKENS,
  nonBhlWhere,
  loadSyncSettings,
  buildEmployeeIndex,
  buildOverrideMap,
  buildAttendanceRecords,
  isProtected,
  persistAttendanceRecords,
};
