// Logika tunggal penentu aksi presensi (check-in / check-out) — dipakai bersama oleh tombol di
// Home (EmployeeHome) dan tombol scan di navigasi bawah (EmployeeLayout) agar selalu konsisten.
//
// Model:
//  - Check-in tersedia: (jam masuk − checkinEarlyMinutes) s/d JAM PULANG efektif (termasuk Sabtu ½ hari).
//    → karyawan izin datang telat (mis. jam 13:00) tetap bisa check-in; keterlambatan dicatat terpisah.
//  - Check-out tersedia: setelah check-in + guard singkat (checkoutGuardMinutes), tanpa peduli jam berapa.
//    → mendukung "pulang cepat" (ditandai EARLY_DEPARTURE oleh backend).

/** Bangun Date pada jam "HH:mm" yang dipatok ke tanggal `now` (opsional offset hari). */
function atTime(hhmm, now, dayOffset = 0) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  if (dayOffset) d.setDate(d.getDate() + dayOffset);
  return d;
}

/** Jam pulang efektif hari ini, memperhitungkan Sabtu setengah hari. */
export function getEffectiveShiftEnd(shift, now = new Date()) {
  if (!shift) return '17:00';
  const isSaturday = now.getDay() === 6;
  if (isSaturday && shift.saturdayType === 'HALF_DAY') {
    return shift.saturdayEndTime || '13:00';
  }
  return shift.endTime || '17:00';
}

/** Parse string jam dari API ("09:39 AM" / "21:39") menjadi Date pada tanggal `now`. */
export function parseClockToday(timeStr, now = new Date()) {
  if (!timeStr || timeStr === '-- : --') return null;
  const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const ap = match[3] ? match[3].toUpperCase() : null;
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  const d = new Date(now);
  d.setHours(h, min, 0, 0);
  return d;
}

/**
 * Tentukan aksi presensi yang berlaku saat ini.
 * @param {object} p
 * @param {string} p.shiftStart "HH:mm"
 * @param {string} p.shiftEnd   "HH:mm" (jam pulang efektif — sudah termasuk Sabtu ½ hari)
 * @param {Date|null} p.checkInAt waktu check-in aktual (untuk guard)
 * @param {boolean} p.hasCheckedIn
 * @param {boolean} p.hasCheckedOut
 * @param {Date} p.now
 * @param {number} p.checkinEarlyMinutes berapa menit sebelum jam masuk check-in dibuka
 * @param {number} p.checkoutGuardMinutes jeda minimal sejak check-in sebelum boleh check-out
 * @returns {{ mode:'check-in'|'check-out'|null, enabled:boolean, state:'check-in'|'check-out'|'early'|'closed'|'guard'|'completed', opensAt?:Date, readyAt?:Date }}
 */
export function resolveAttendanceAction({
  shiftStart = '08:00',
  shiftEnd = '17:00',
  checkInAt = null,
  hasCheckedIn,
  hasCheckedOut,
  now = new Date(),
  checkinEarlyMinutes = 120,
  checkoutGuardMinutes = 30,
}) {
  if (hasCheckedIn && hasCheckedOut) {
    return { mode: null, enabled: false, state: 'completed' };
  }

  // ── Belum check-in: tentukan jendela check-in [masuk−early, jam pulang efektif] ──
  if (!hasCheckedIn) {
    const start = atTime(shiftStart, now);
    const [sH, sM] = String(shiftStart).split(':').map(Number);
    const [eH, eM] = String(shiftEnd).split(':').map(Number);
    const crossesMidnight = (eH * 60 + eM) <= (sH * 60 + sM); // shift malam
    const open = new Date(start.getTime() - checkinEarlyMinutes * 60 * 1000);
    const close = atTime(shiftEnd, now, crossesMidnight ? 1 : 0);

    if (now < open) return { mode: 'check-in', enabled: false, state: 'early', opensAt: open };
    if (now > close) return { mode: null, enabled: false, state: 'closed' };
    return { mode: 'check-in', enabled: true, state: 'check-in' };
  }

  // ── Sudah check-in, belum check-out: guard singkat anti salah-pencet ──
  if (checkInAt) {
    const readyAt = new Date(checkInAt.getTime() + checkoutGuardMinutes * 60 * 1000);
    if (now < readyAt) return { mode: 'check-out', enabled: false, state: 'guard', readyAt };
  }
  return { mode: 'check-out', enabled: true, state: 'check-out' };
}
