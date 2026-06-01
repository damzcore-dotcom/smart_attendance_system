/**
 * @module analyticsAggregator
 * @description Calculates quick aggregations and human-readable insights from
 * attendance, payroll, and leave data for chatbot responses. All functions are
 * pure (no DB calls) and produce bilingual summary texts (Indonesian + English).
 */

'use strict';

// ─── Formatting Helpers ──────────────────────────────────────────────────────

/**
 * Formats a number as Indonesian-locale currency (IDR).
 * @param {number} value
 * @returns {string}
 */
function formatCurrency(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Rp 0';
  return 'Rp ' + value.toLocaleString('id-ID');
}

/**
 * Formats a number to at most 1 decimal place.
 * @param {number} value
 * @returns {string}
 */
function formatDecimal(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

/**
 * Safe percentage calculation.
 * @param {number} part
 * @param {number} whole
 * @returns {number} Percentage rounded to 1 decimal
 */
function pct(part, whole) {
  if (!whole || whole === 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

// ─── Attendance Aggregation ──────────────────────────────────────────────────

/**
 * @typedef {Object} AttendanceRecord
 * @property {string}  tanggal               - Date string
 * @property {string}  nik                   - Employee ID number
 * @property {string}  nama                  - Employee name
 * @property {string}  jamMasuk              - Clock-in time
 * @property {string}  jamKeluar             - Clock-out time
 * @property {string}  statusKehadiran       - Attendance status (e.g. "Hadir", "Tidak Hadir", "Terlambat")
 * @property {number}  keterlambatanMenit    - Late minutes
 * @property {number}  dendaKeterlambatanMenit - Penalty minutes for lateness
 */

/**
 * @typedef {Object} AttendanceAggregation
 * @property {number} totalRecords        - Total attendance records processed
 * @property {number} totalPresent        - Count of present records
 * @property {number} totalLate           - Count of late records
 * @property {number} totalAbsent         - Count of absent records
 * @property {number} avgLateMinutes      - Average lateness in minutes (for late records only)
 * @property {number} totalPenaltyMinutes - Sum of penalty minutes
 * @property {number} attendanceRate      - Attendance rate as a percentage
 * @property {string} summaryTextId       - Human-readable summary in Indonesian
 * @property {string} summaryTextEn       - Human-readable summary in English
 */

/**
 * Aggregates an array of attendance log objects into summary statistics.
 *
 * @param {AttendanceRecord[]} data - Array of attendance log records
 * @returns {AttendanceAggregation}
 *
 * @example
 * const summary = aggregateAttendance(records);
 * console.log(summary.summaryTextId);
 * // "Dari 20 catatan: 18 hadir (90%), 3 terlambat (rata-rata 12.5 menit), 2 tidak hadir. Total denda: 15 menit."
 */
function aggregateAttendance(data) {
  const records = Array.isArray(data) ? data : [];
  const totalRecords = records.length;

  if (totalRecords === 0) {
    return {
      totalRecords: 0,
      totalPresent: 0,
      totalLate: 0,
      totalAbsent: 0,
      avgLateMinutes: 0,
      totalPenaltyMinutes: 0,
      attendanceRate: 0,
      summaryTextId: 'Tidak ada data kehadiran untuk ditampilkan.',
      summaryTextEn: 'No attendance data available.',
    };
  }

  let totalPresent = 0;
  let totalLate = 0;
  let totalAbsent = 0;
  let totalLateMinutes = 0;
  let totalPenaltyMinutes = 0;

  for (const rec of records) {
    const status = (rec.statusKehadiran || '').toLowerCase();
    const lateMin = Number(rec.keterlambatanMenit) || 0;
    const penaltyMin = Number(rec.dendaKeterlambatanMenit) || 0;

    if (status === 'tidak hadir' || status === 'absent' || status === 'alpha') {
      totalAbsent++;
    } else {
      // Present (includes on-time and late)
      totalPresent++;
    }

    if (lateMin > 0 || status === 'terlambat' || status === 'late') {
      totalLate++;
      totalLateMinutes += lateMin;
    }

    totalPenaltyMinutes += penaltyMin;
  }

  const avgLateMinutes = totalLate > 0
    ? Math.round((totalLateMinutes / totalLate) * 10) / 10
    : 0;

  const attendanceRate = pct(totalPresent, totalRecords);

  const summaryTextId = [
    `Dari ${totalRecords} catatan:`,
    `${totalPresent} hadir (${formatDecimal(attendanceRate)}%),`,
    `${totalLate} terlambat${totalLate > 0 ? ` (rata-rata ${formatDecimal(avgLateMinutes)} menit)` : ''},`,
    `${totalAbsent} tidak hadir.`,
    `Total denda: ${totalPenaltyMinutes} menit.`,
  ].join(' ');

  const summaryTextEn = [
    `Out of ${totalRecords} records:`,
    `${totalPresent} present (${formatDecimal(attendanceRate)}%),`,
    `${totalLate} late${totalLate > 0 ? ` (avg ${formatDecimal(avgLateMinutes)} min)` : ''},`,
    `${totalAbsent} absent.`,
    `Total penalty: ${totalPenaltyMinutes} min.`,
  ].join(' ');

  return {
    totalRecords,
    totalPresent,
    totalLate,
    totalAbsent,
    avgLateMinutes,
    totalPenaltyMinutes,
    attendanceRate,
    summaryTextId,
    summaryTextEn,
  };
}

// ─── Payroll Aggregation ─────────────────────────────────────────────────────

/**
 * @typedef {Object} PayrollEmployee
 * @property {number} gajiKotor       - Gross salary
 * @property {number} dendaKehadiran  - Attendance deductions
 * @property {number} gajiBersih      - Net salary
 * @property {string} departemen      - Department name
 */

/**
 * @typedef {Object} PayrollSummary
 * @property {Object} daftarRincianKaryawan - Employee payroll details wrapper
 */

/**
 * @typedef {Object} PayrollAggregation
 * @property {number} totalEmployees   - Number of employees in the payroll
 * @property {number} totalGross       - Sum of gross salaries
 * @property {number} totalDeductions  - Sum of attendance deductions
 * @property {number} totalNet         - Sum of net salaries
 * @property {number} avgNet           - Average net salary
 * @property {string} summaryTextId    - Indonesian summary
 * @property {string} summaryTextEn    - English summary
 */

/**
 * Aggregates a payroll summary object into totals and a readable summary.
 *
 * @param {PayrollSummary} data - Payroll data with daftarRincianKaryawan array
 * @returns {PayrollAggregation}
 *
 * @example
 * const summary = aggregatePayroll(payrollData);
 * console.log(summary.summaryTextEn);
 * // "Payroll for 25 employees: Total gross Rp 125,000,000, deductions Rp 2,500,000, ..."
 */
function aggregatePayroll(data) {
  const employees = (data && Array.isArray(data.daftarRincianKaryawan))
    ? data.daftarRincianKaryawan
    : [];

  const totalEmployees = employees.length;

  if (totalEmployees === 0) {
    return {
      totalEmployees: 0,
      totalGross: 0,
      totalDeductions: 0,
      totalNet: 0,
      avgNet: 0,
      summaryTextId: 'Tidak ada data penggajian untuk ditampilkan.',
      summaryTextEn: 'No payroll data available.',
    };
  }

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const emp of employees) {
    totalGross += Number(emp.gajiKotor) || 0;
    totalDeductions += Number(emp.dendaKehadiran) || 0;
    totalNet += Number(emp.gajiBersih) || 0;
  }

  const avgNet = Math.round(totalNet / totalEmployees);

  const summaryTextId = [
    `Penggajian untuk ${totalEmployees} karyawan:`,
    `Total gaji kotor ${formatCurrency(totalGross)},`,
    `potongan kehadiran ${formatCurrency(totalDeductions)},`,
    `total gaji bersih ${formatCurrency(totalNet)}.`,
    `Rata-rata gaji bersih: ${formatCurrency(avgNet)}.`,
  ].join(' ');

  const summaryTextEn = [
    `Payroll for ${totalEmployees} employees:`,
    `Total gross ${formatCurrency(totalGross)},`,
    `deductions ${formatCurrency(totalDeductions)},`,
    `total net ${formatCurrency(totalNet)}.`,
    `Average net salary: ${formatCurrency(avgNet)}.`,
  ].join(' ');

  return {
    totalEmployees,
    totalGross,
    totalDeductions,
    totalNet,
    avgNet,
    summaryTextId,
    summaryTextEn,
  };
}

// ─── Leave Aggregation ──────────────────────────────────────────────────────

/**
 * @typedef {Object} LeaveRequest
 * @property {string} statusPersetujuan - Approval status (e.g. "Disetujui", "Pending", "Ditolak")
 * @property {string} jenisIzin         - Leave type (e.g. "Cuti Tahunan", "Sakit")
 */

/**
 * @typedef {Object} LeaveAggregation
 * @property {number}  total           - Total leave requests
 * @property {number}  approved        - Approved count
 * @property {number}  pending         - Pending count
 * @property {number}  rejected        - Rejected count
 * @property {Record<string, number>} byType - Counts grouped by leave type
 * @property {string}  summaryTextId   - Indonesian summary
 * @property {string}  summaryTextEn   - English summary
 */

/** Normalised status keywords that indicate "approved" */
const APPROVED_KEYWORDS = new Set(['disetujui', 'approved', 'diterima', 'acc']);

/** Normalised status keywords that indicate "rejected" */
const REJECTED_KEYWORDS = new Set(['ditolak', 'rejected', 'tidak disetujui']);

/**
 * Aggregates an array of leave request objects into summary statistics.
 *
 * @param {LeaveRequest[]} data - Array of leave request records
 * @returns {LeaveAggregation}
 *
 * @example
 * const summary = aggregateLeave(leaveRequests);
 * console.log(summary.summaryTextId);
 * // "Total 15 pengajuan izin: 10 disetujui, 3 menunggu, 2 ditolak. ..."
 */
function aggregateLeave(data) {
  const records = Array.isArray(data) ? data : [];
  const total = records.length;

  if (total === 0) {
    return {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      byType: {},
      summaryTextId: 'Tidak ada data cuti/izin untuk ditampilkan.',
      summaryTextEn: 'No leave data available.',
    };
  }

  let approved = 0;
  let pending = 0;
  let rejected = 0;
  /** @type {Record<string, number>} */
  const byType = {};

  for (const rec of records) {
    const status = (rec.statusPersetujuan || '').toLowerCase().trim();

    if (APPROVED_KEYWORDS.has(status)) {
      approved++;
    } else if (REJECTED_KEYWORDS.has(status)) {
      rejected++;
    } else {
      pending++;
    }

    const leaveType = (rec.jenisIzin || 'Lainnya').trim();
    byType[leaveType] = (byType[leaveType] || 0) + 1;
  }

  // Build type breakdown string
  const typeBreakdownId = Object.entries(byType)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');

  const typeBreakdownEn = Object.entries(byType)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');

  const summaryTextId = [
    `Total ${total} pengajuan izin:`,
    `${approved} disetujui,`,
    `${pending} menunggu,`,
    `${rejected} ditolak.`,
    `Berdasarkan jenis: ${typeBreakdownId}.`,
  ].join(' ');

  const summaryTextEn = [
    `Total ${total} leave requests:`,
    `${approved} approved,`,
    `${pending} pending,`,
    `${rejected} rejected.`,
    `By type: ${typeBreakdownEn}.`,
  ].join(' ');

  return {
    total,
    approved,
    pending,
    rejected,
    byType,
    summaryTextId,
    summaryTextEn,
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  aggregateAttendance,
  aggregatePayroll,
  aggregateLeave,
};
