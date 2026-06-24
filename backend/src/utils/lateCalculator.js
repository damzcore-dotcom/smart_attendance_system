/**
 * Late Calculator Utility
 * Automatically calculates lateness based on shift schedule
 */

/**
 * Check if checkOut is before the shift end time (Early Departure)
 */
function isEarlyDeparture(checkOutTime, shiftEndTime, shiftStartTime = '08:00') {
  if (!checkOutTime || !shiftEndTime) return false;
  
  const checkOut = new Date(checkOutTime);
  const [endHour, endMinute] = shiftEndTime.split(':').map(Number);
  const checkOutHour = checkOut.getHours();
  const checkOutMinute = checkOut.getMinutes();
  
  let shiftEndMins = endHour * 60 + endMinute;
  let checkOutMins = checkOutHour * 60 + checkOutMinute;
  
  const [startHour, startMinute] = shiftStartTime.split(':').map(Number);
  const shiftStartMins = startHour * 60 + startMinute;
  
  const isNightShift = shiftEndMins < shiftStartMins;
  
  if (isNightShift) {
    // If checkOut happened after midnight but before shift ends
    if (checkOutMins < shiftStartMins - 6 * 60) {
      checkOutMins += 24 * 60;
    }
    shiftEndMins += 24 * 60;
  }
  
  // Return true if checkOut is strictly before shiftEnd
  return checkOutMins < shiftEndMins;
}

/**
 * Check if the shift is still active for a given date.
 * If the current time is before the shift's end time on that date, it's still active.
 */
function isShiftStillActive(date, shiftEndTime, shiftStartTime = '08:00') {
  if (!date || !shiftEndTime) return false;
  
  // Get date strings to compare in local time
  const today = new Date();
  const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  
  const attDate = new Date(date);
  const attDateStr = attDate.getFullYear() + '-' + String(attDate.getMonth() + 1).padStart(2, '0') + '-' + String(attDate.getDate()).padStart(2, '0');
  
  if (todayStr !== attDateStr) {
    // If it's a past date, the shift has already ended
    return false;
  }
  
  // If it's today, check if current time is before the shift end time
  const [endHour, endMinute] = shiftEndTime.split(':').map(Number);
  const nowHour = today.getHours();
  const nowMinute = today.getMinutes();
  
  let shiftEndMins = endHour * 60 + endMinute;
  let nowMins = nowHour * 60 + nowMinute;
  
  const [startHour, startMinute] = shiftStartTime.split(':').map(Number);
  const shiftStartMins = startHour * 60 + startMinute;
  
  const isNightShift = shiftEndMins < shiftStartMins;
  
  if (isNightShift) {
    if (nowMins < shiftStartMins - 6 * 60) {
      nowMins += 24 * 60;
    }
    shiftEndMins += 24 * 60;
  }
  
  return nowMins < shiftEndMins;
}

/**
 * Calculate late minutes
 * @param {Date} checkInTime - Actual check-in time
 * @param {string} shiftStartTime - Shift start time in "HH:mm" format
 * @param {number} gracePeriodMinutes - Grace period in minutes
 * @param {string} shiftEndTime - Shift end time in "HH:mm" format
 * @param {object} roundingConfig - Configuration for late rounding
 * @returns {{ lateMinutes: number, status: 'PRESENT' | 'LATE' }}
 */
function calculateLateness(
  checkInTime, 
  shiftStartTime, 
  gracePeriodMinutes = 15, 
  shiftEndTime = null,
  roundingConfig = { enabled: true, interval: 30 }
) {
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
    if (checkInMins < shiftMins - 6 * 60) {
      checkInMins += 24 * 60; // Push checkIn into the "next day" continuum
    }
  }

  // Grace deadline in minutes
  const graceDeadlineMins = shiftMins + gracePeriodMinutes;

  if (checkInMins <= graceDeadlineMins) {
    return { lateMinutes: 0, status: 'PRESENT' };
  }
  
  const exactLateMinutes = checkInMins - shiftMins;
  
  // Respect rounding configuration
  let finalLateMinutes = exactLateMinutes;
  if (roundingConfig && roundingConfig.enabled !== false) {
    const interval = roundingConfig.interval || 30;
    finalLateMinutes = Math.ceil(exactLateMinutes / interval) * interval;
  }
  
  return { lateMinutes: finalLateMinutes, status: 'LATE' };
}

/**
 * Determine final attendance status based on check-in/out presence and penalty rules
 * @param {Date|null} checkIn 
 * @param {Date|null} checkOut 
 * @param {string} currentStatus - Current status (PRESENT or LATE) from check-in
 * @param {Date|string|null} date - The date of attendance
 * @param {object|null} penaltyRules - Configuration rules
 * @param {string} shiftEndTime - Shift end time (HH:mm)
 * @param {string} shiftStartTime - Shift start time (HH:mm)
 * @returns {string} - ABSENT, MANGKIR, PRESENT, LATE, HOLIDAY, or EARLY_DEPARTURE
 */
function resolveStatus(
  checkIn, 
  checkOut, 
  currentStatus = 'PRESENT', 
  date = null, 
  penaltyRules = null,
  shiftEndTime = '17:00',
  shiftStartTime = '08:00'
) {
  // If it's explicitly marked as HOLIDAY, CUTI, SAKIT, or IZIN (e.g. from Leave System or Mass Leave)
  if (['HOLIDAY', 'CUTI', 'SAKIT', 'IZIN', 'HALF_DAY'].includes(currentStatus)) return currentStatus;
  
  // Extract configurations with fallback to default rules
  const rule1Enabled = penaltyRules ? penaltyRules.rule1Enabled !== false : true;
  const rule1Status = penaltyRules ? penaltyRules.rule1Status || 'MANGKIR' : 'MANGKIR';
  
  const rule2Enabled = penaltyRules ? penaltyRules.rule2Enabled !== false : true;
  
  const rule3Enabled = penaltyRules ? penaltyRules.rule3Enabled !== false : true;
  const rule3Status = penaltyRules ? penaltyRules.rule3Status || 'MANGKIR' : 'MANGKIR';

  const isEarly = isEarlyDeparture(checkOut, shiftEndTime, shiftStartTime);
  
  if (!checkIn && !checkOut) return 'ABSENT';
  
  // Rule 1: Tidak melakukan finger masuk
  if (!checkIn) {
    return rule1Enabled ? rule1Status : 'MANGKIR';
  }
  
  // Rule 2: Ada finger masuk dan terlambat
  if (checkIn && currentStatus === 'LATE') {
    if (isEarly) return 'EARLY_DEPARTURE';
    return 'LATE';
  }
  
  // Rule 3: Masuk tidak terlambat (PRESENT) tapi tidak ada finger pulang
  if (checkIn && !checkOut && currentStatus === 'PRESENT') {
    // If the shift is still active today, we don't mark as Mangkir yet (keep PRESENT)
    if (isShiftStillActive(date, shiftEndTime, shiftStartTime)) {
      return 'PRESENT';
    }
    return rule3Enabled ? rule3Status : 'PRESENT';
  }

  // If there's checkout and they left early
  if (checkIn && checkOut && isEarly) {
    return 'EARLY_DEPARTURE';
  }
  
  return currentStatus; // Either PRESENT or LATE
}

function parsePenaltySettings(settingsList) {
  const settingsMap = {};
  if (Array.isArray(settingsList)) {
    settingsList.forEach(s => {
      settingsMap[s.key] = s.value;
    });
  }
  return {
    penaltyRules: {
      rule1Enabled: settingsMap.penaltyRule1Enabled !== 'false',
      rule1Status: settingsMap.penaltyRule1Status || 'MANGKIR',
      rule1Minutes: parseInt(settingsMap.penaltyRule1Minutes || '30', 10),
      rule2Enabled: settingsMap.penaltyRule2Enabled !== 'false',
      rule2AddPenalty: settingsMap.penaltyRule2AddPenalty === 'true',
      rule2ExtraMinutes: parseInt(settingsMap.penaltyRule2ExtraMinutes || '0', 10),
      rule3Enabled: settingsMap.penaltyRule3Enabled !== 'false',
      rule3Status: settingsMap.penaltyRule3Status || 'MANGKIR',
      rule3Minutes: parseInt(settingsMap.penaltyRule3Minutes || '30', 10),
    },
    roundingConfig: {
      enabled: settingsMap.lateRoundingEnabled !== 'false',
      interval: parseInt(settingsMap.lateRoundingInterval || '30', 10)
    }
  };
}

module.exports = { calculateLateness, resolveStatus, isEarlyDeparture, isShiftStillActive, parsePenaltySettings };

