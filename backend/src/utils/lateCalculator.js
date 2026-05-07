/**
 * Late Calculator Utility
 * Automatically calculates lateness based on shift schedule
 */

/**
 * Calculate late minutes
 * @param {Date} checkInTime - Actual check-in time
 * @param {string} shiftStartTime - Shift start time in "HH:mm" format
 * @param {number} gracePeriodMinutes - Grace period in minutes
 * @returns {{ lateMinutes: number, status: 'PRESENT' | 'LATE' }}
 */
function calculateLateness(checkInTime, shiftStartTime, gracePeriodMinutes = 15) {
  const checkIn = new Date(checkInTime);
  
  // Parse shift start time
  const [shiftHour, shiftMinute] = shiftStartTime.split(':').map(Number);
  
  // Create shift start datetime for the same day
  const shiftStart = new Date(checkIn);
  shiftStart.setHours(shiftHour, shiftMinute, 0, 0);
  
  // Add grace period
  const graceDeadline = new Date(shiftStart.getTime() + gracePeriodMinutes * 60 * 1000);
  
  if (checkIn <= graceDeadline) {
    return { lateMinutes: 0, status: 'PRESENT' };
  }
  
  // Calculate minutes late (from original shift start, not grace deadline)
  const diffMs = checkIn.getTime() - shiftStart.getTime();
  const rawLateMinutes = Math.ceil(diffMs / (60 * 1000));
  
  // Round up to nearest 30 minutes (e.g., 1-30m -> 30m, 31-60m -> 60m)
  const lateMinutes = Math.ceil(rawLateMinutes / 30) * 30;
  return { lateMinutes, status: 'LATE' };
}

/**
 * Determine final attendance status based on check-in/out presence
 * @param {Date|null} checkIn 
 * @param {Date|null} checkOut 
 * @param {string} currentStatus - Current status (PRESENT or LATE) from check-in
 * @returns {string} - ABSENT, MANGKIR, PRESENT, or LATE
 */
function resolveStatus(checkIn, checkOut, currentStatus = 'PRESENT') {
  // If it's explicitly marked as HOLIDAY, CUTI, SAKIT, or IZIN (e.g. from Leave System or Mass Leave)
  if (['HOLIDAY', 'CUTI', 'SAKIT', 'IZIN'].includes(currentStatus)) return currentStatus;
  
  if (!checkIn && !checkOut) return 'ABSENT';
  if (!checkIn || !checkOut) return 'MANGKIR';
  return currentStatus; // Either PRESENT or LATE
}

module.exports = { calculateLateness, resolveStatus };
