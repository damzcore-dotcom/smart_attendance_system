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
function calculateLateness(checkInTime, shiftStartTime, gracePeriodMinutes = 15, shiftEndTime = null) {
  const checkIn = new Date(checkInTime);
  
  // Parse shift start time (e.g. "08:00")
  const [shiftHour, shiftMinute] = shiftStartTime.split(':').map(Number);
  
  // Extract checkIn hour and minute in local system time
  const checkInHour = checkIn.getHours();
  const checkInMinute = checkIn.getMinutes();

  // Convert both into absolute minutes from midnight for safe comparison
  let shiftMins = shiftHour * 60 + shiftMinute;
  let checkInMins = checkInHour * 60 + checkInMinute;

  // Handle Night Shift logic
  let isNightShift = false;
  if (shiftEndTime) {
    const [endHour, endMinute] = shiftEndTime.split(':').map(Number);
    const shiftEndMins = endHour * 60 + endMinute;
    isNightShift = shiftEndMins < shiftMins;
  } else {
    // Backward compatibility fallback
    isNightShift = shiftHour >= 18;
  }

  if (isNightShift) {
    // If checkIn happens after midnight (e.g., 01:00 AM or late morning like 07:15 AM)
    // it will be far smaller than shift start mins (e.g., 22:00 = 1320 mins).
    // If it's more than 6 hours before the shift starts, we treat it as next day check-in.
    if (checkInMins < shiftMins - 6 * 60) {
      checkInMins += 24 * 60; // Push checkIn into the "next day" continuum
    }
  }

  // Grace deadline in minutes
  const graceDeadlineMins = shiftMins + gracePeriodMinutes;

  if (checkInMins <= graceDeadlineMins) {
    return { lateMinutes: 0, status: 'PRESENT' };
  }
  
  // Hitung jumlah menit terlambat (secara REAK/RIL, tanpa pembagian block 30 menit)
  const exactLateMinutes = checkInMins - shiftMins;
  
  return { lateMinutes: exactLateMinutes, status: 'LATE' };
}

/**
 * Determine final attendance status based on check-in/out presence
 * @param {Date|null} checkIn 
 * @param {Date|null} checkOut 
 * @param {string} currentStatus - Current status (PRESENT or LATE) from check-in
 * @param {Date|string|null} date - The date of attendance
 * @returns {string} - ABSENT, MANGKIR, PRESENT, LATE, or HOLIDAY
 */
function resolveStatus(checkIn, checkOut, currentStatus = 'PRESENT', date = null) {
  // If it's explicitly marked as HOLIDAY, CUTI, SAKIT, or IZIN (e.g. from Leave System or Mass Leave)
  if (['HOLIDAY', 'CUTI', 'SAKIT', 'IZIN'].includes(currentStatus)) return currentStatus;
  
  // Note: Holiday overrides are now handled by the controller using CompanyCalendar and workingDays settings

  
  if (!checkIn && !checkOut) return 'ABSENT';
  if (!checkIn || !checkOut) return 'MANGKIR';
  return currentStatus; // Either PRESENT or LATE
}

module.exports = { calculateLateness, resolveStatus };
