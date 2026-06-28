const prisma = require('../prismaClient');

// Nilai status harian/BHL (dikecualikan dari materialisasi absen — BHL tidak wajib hadir harian).
const BHL_VALUES = ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'];

/**
 * Pastikan setiap karyawan aktif (non-BHL) punya baris absensi untuk satu tanggal.
 * Bila tidak ada (tidak finger & tidak ter-sync) → buat baris ABSENT, agar ketidakhadiran
 * benar-benar TERHITUNG. Aman: skipDuplicates + lewati karyawan cuti/izin/sakit (approved)
 * dan hari libur murni. Bisa dryRun untuk sekadar menghitung tanpa menulis.
 *
 * @param {Date} dateUTC - Tanggal (UTC midnight) yang merepresentasikan tanggal WIB.
 */
async function materializeAbsencesForDate(dateUTC, { dryRun = false, minExisting = 0 } = {}) {
  const weekday = new Date(dateUTC).getUTCDay(); // 0=Minggu … 6=Sabtu (tanggal WIB)
  const dateStr = dateUTC.toISOString().split('T')[0];

  const wdSetting = await prisma.settings.findUnique({ where: { key: 'workingDays' } });
  const workingDays = JSON.parse(wdSetting?.value || '[1,2,3,4,5]');

  const override = await prisma.companyCalendar.findFirst({ where: { date: dateUTC } });
  let isWorkday;
  if (override) isWorkday = override.type === 'WORKDAY';
  else isWorkday = workingDays.includes(weekday) || weekday === 6; // Sabtu mungkin kerja (tergantung shift)

  if (!isWorkday) {
    return { date: dateStr, isWorkday: false, candidates: 0, existing: 0, leaves: 0, willCreate: 0, created: 0 };
  }

  const emps = await prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      employmentStatus: { notIn: BHL_VALUES },
      salaryCategory: { notIn: BHL_VALUES },
    },
    select: { id: true },
  });
  const ids = emps.map(e => e.id);
  if (ids.length === 0) {
    return { date: dateStr, isWorkday: true, candidates: 0, existing: 0, leaves: 0, willCreate: 0, created: 0 };
  }

  const [existing, leaves] = await Promise.all([
    prisma.attendance.findMany({ where: { date: dateUTC, employeeId: { in: ids } }, select: { employeeId: true } }),
    prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', startDate: { lte: dateUTC }, endDate: { gte: dateUTC } },
      select: { employeeId: true },
    }),
  ]);
  const haveSet = new Set(existing.map(e => e.employeeId));
  const leaveSet = new Set(leaves.map(l => l.employeeId));

  // Pengaman: jangan tandai absen pada hari yang BELUM ter-sync sama sekali (data absen = 0
  // atau di bawah ambang). Itu berarti datanya belum ditarik, bukan semua karyawan absen.
  if (existing.length < minExisting) {
    return { date: dateStr, isWorkday: true, skipped: true, candidates: ids.length, existing: existing.length, leaves: leaveSet.size, willCreate: 0, created: 0 };
  }

  const toCreate = ids.filter(id => !haveSet.has(id) && !leaveSet.has(id));

  let created = 0;
  if (!dryRun && toCreate.length) {
    const r = await prisma.attendance.createMany({
      data: toCreate.map(id => ({ employeeId: id, date: dateUTC, status: 'ABSENT', mode: 'System', source: 'auto-absence' })),
      skipDuplicates: true,
    });
    created = r.count;
  }

  return {
    date: dateStr,
    isWorkday: true,
    candidates: ids.length,
    existing: existing.length,
    leaves: leaveSet.size,
    willCreate: toCreate.length,
    created,
  };
}

/** Materialisasi absen untuk KEMARIN (dipakai cron harian). */
async function materializeYesterday() {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const dateUTC = new Date(Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()));
  return materializeAbsencesForDate(dateUTC);
}

/**
 * Backfill absen untuk rentang tanggal (inclusive). Default dryRun=true (hanya menghitung).
 * @param {string} startStr - 'YYYY-MM-DD'
 * @param {string} endStr   - 'YYYY-MM-DD'
 */
async function backfillAbsences(startStr, endStr, { dryRun = true, minExisting = 1 } = {}) {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  let cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  const days = [];
  let totalWillCreate = 0;
  let totalCreated = 0;
  let workdays = 0;
  let skippedUnsynced = 0;
  let guard = 0;

  while (cur <= end && guard < 400) {
    const r = await materializeAbsencesForDate(new Date(cur), { dryRun, minExisting });
    if (r.isWorkday) {
      days.push(r);
      workdays++;
      if (r.skipped) skippedUnsynced++;
      totalWillCreate += r.willCreate;
      totalCreated += r.created;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
  }

  return { dryRun, minExisting, start: startStr, end: endStr, workdays, skippedUnsynced, totalWillCreate, totalCreated, days };
}

module.exports = { materializeAbsencesForDate, materializeYesterday, backfillAbsences, BHL_VALUES };
