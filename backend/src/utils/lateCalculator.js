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
  const lateMinutes = Math.ceil(diffMs / (60 * 1000));
  
  return { lateMinutes, status: 'LATE' };
}

module.exports = { calculateLateness };
