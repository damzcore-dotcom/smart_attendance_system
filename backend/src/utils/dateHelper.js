/**
 * Date helper utilities for consistent timezone handling.
 * All dates in the system use UTC midnight for the 'date' field.
 * All times (checkIn/checkOut) use server local time.
 */

/**
 * Convert a local Date to UTC midnight for storage as attendance date.
 * This ensures the calendar date is preserved regardless of server timezone.
 * @param {Date} localDate 
 * @returns {Date} UTC midnight date
 */
function toUTCMidnight(localDate) {
  const d = localDate instanceof Date ? localDate : new Date(localDate);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0));
}

/**
 * Parse a date string (YYYY-MM-DD) to UTC midnight Date.
 * @param {string} dateStr 
 * @returns {Date}
 */
function parseUTCDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/**
 * Get UTC midnight for "today" based on local server time.
 * @returns {Date}
 */
function getUTCToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
}

/**
 * Get UTC midnight for "yesterday" based on local server time.
 * @returns {Date}
 */
function getUTCYesterday() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0));
}

/**
 * Get start of week (Sunday) as UTC midnight.
 * @param {Date} [localDate] defaults to now
 * @returns {Date}
 */
function getUTCStartOfWeek(localDate) {
  const d = localDate || new Date();
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), diff, 0, 0, 0, 0));
}

/**
 * Get start of month as UTC midnight.
 * @param {Date} [localDate] defaults to now
 * @returns {Date}
 */
function getUTCStartOfMonth(localDate) {
  const d = localDate || new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0));
}

/**
 * Get end of day (23:59:59.999) in UTC for a given date.
 * @param {Date} utcDate 
 * @returns {Date}
 */
function getUTCEndOfDay(utcDate) {
  const d = new Date(utcDate);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** Valid attendance statuses */
const VALID_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'MANGKIR', 'SAKIT', 'IZIN', 'CUTI', 'HOLIDAY'];

/** Default mangkir penalty in minutes — should eventually be read from Settings */
const MANGKIR_PENALTY_MINUTES = 30;

module.exports = {
  toUTCMidnight,
  parseUTCDate,
  getUTCToday,
  getUTCYesterday,
  getUTCStartOfWeek,
  getUTCStartOfMonth,
  getUTCEndOfDay,
  VALID_STATUSES,
  MANGKIR_PENALTY_MINUTES,
};
