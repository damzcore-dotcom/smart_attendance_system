/**
 * Shared attendance status utilities.
 * Single source of truth for status labels, colors, and display logic.
 * 
 * Backend always sends enum values: PRESENT, LATE, ABSENT, MANGKIR, SAKIT, IZIN, CUTI, HOLIDAY
 * This utility maps them to Indonesian labels and UI colors.
 */

/** Map enum status → Indonesian display label */
export const STATUS_LABELS = {
  PRESENT: 'Hadir',
  LATE: 'Terlambat',
  ABSENT: 'Alpa',
  MANGKIR: 'Mangkir',
  SAKIT: 'Sakit',
  IZIN: 'Izin',
  CUTI: 'Cuti',
  HOLIDAY: 'Libur',
  EARLY_DEPARTURE: 'Pulang Cepat',
};

/** Map enum status → Tailwind color classes for badge/pill display */
export const STATUS_COLORS = {
  PRESENT: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  LATE: 'bg-amber-50 text-amber-600 border-amber-200',
  ABSENT: 'bg-rose-50 text-rose-600 border-rose-200',
  MANGKIR: 'bg-rose-50 text-rose-600 border-rose-200',
  SAKIT: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  IZIN: 'bg-blue-50 text-blue-600 border-blue-200',
  CUTI: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  HOLIDAY: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  EARLY_DEPARTURE: 'bg-blue-50 text-blue-600 border-blue-200 animate-blink font-bold shadow-sm',
};

/**
 * Get the Indonesian display label for a status enum.
 * Handles both enum (PRESENT) and legacy Indonesian labels (Hadir) gracefully.
 * @param {string} status - Status enum or legacy label
 * @returns {string} Indonesian display label
 */
export function getStatusLabel(status) {
  if (!status) return 'Alpa';
  // If it's already an enum, map it
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  // If it's already an Indonesian label (legacy), return as-is
  const reverseCheck = Object.values(STATUS_LABELS).includes(status);
  if (reverseCheck) return status;
  // Fallback
  return status;
}

/**
 * Get the Tailwind CSS classes for a status badge.
 * Handles both enum (PRESENT) and legacy Indonesian labels (Hadir).
 * @param {string} status - Status enum or legacy label
 * @returns {string} Tailwind CSS classes
 */
export function getStatusColor(status) {
  if (!status) return STATUS_COLORS.ABSENT;
  // Direct enum match
  if (STATUS_COLORS[status]) return STATUS_COLORS[status];
  // Reverse lookup for legacy Indonesian labels
  const enumKey = Object.entries(STATUS_LABELS).find(([, v]) => v === status)?.[0];
  if (enumKey && STATUS_COLORS[enumKey]) return STATUS_COLORS[enumKey];
  // Fallback
  return 'bg-slate-50 text-slate-500 border-slate-200';
}

/**
 * Normalize a status value to its enum form.
 * Converts legacy Indonesian labels back to enum.
 * @param {string} status 
 * @returns {string} Enum status value
 */
export function normalizeStatus(status) {
  if (!status) return 'ABSENT';
  // Already an enum
  if (STATUS_LABELS[status]) return status;
  // Reverse lookup
  const entry = Object.entries(STATUS_LABELS).find(([, v]) => v === status);
  return entry ? entry[0] : status;
}

/**
 * Check if a status represents "present at work" (either on-time or late).
 * @param {string} status - Enum or legacy label
 * @returns {boolean}
 */
export function isPresent(status) {
  const norm = normalizeStatus(status);
  return norm === 'PRESENT' || norm === 'LATE' || norm === 'EARLY_DEPARTURE';
}

/**
 * Check if a status represents an absence (no show).
 * @param {string} status - Enum or legacy label
 * @returns {boolean}
 */
export function isAbsent(status) {
  const norm = normalizeStatus(status);
  return norm === 'ABSENT' || norm === 'MANGKIR';
}

/** Default mangkir penalty in minutes — used as fallback if Settings is unavailable */
export const DEFAULT_MANGKIR_PENALTY_MINUTES = 30;
