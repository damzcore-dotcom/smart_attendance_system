/**
 * Advanced Date Parser for Smart Attendance Chatbot
 * 
 * Parses complex relative and absolute date/time expressions 
 * in both Indonesian and English, including:
 * - Relative dates (hari ini, kemarin, X hari lalu)
 * - Relative periods (minggu ini, bulan lalu, tahun ini)
 * - Quarter support (Q1 2025, kuartal 2)
 * - Date ranges (antara tanggal 1-15 Juni)
 * - Dual month ranges (Januari sampai Maret 2026)
 * - Last N days (30 hari terakhir)
 * - Special flags (sejak bergabung)
 */

const monthMap = {
  januari: 0, january: 0, jan: 0,
  februari: 1, february: 1, feb: 1,
  maret: 2, march: 2, mar: 2,
  april: 3, apr: 3,
  mei: 4, may: 4,
  juni: 5, june: 5, jun: 5,
  juli: 6, july: 6, jul: 6,
  agustus: 7, august: 7, ags: 7, aug: 7,
  september: 8, sep: 8,
  oktober: 9, october: 9, okt: 9, oct: 9,
  november: 10, nov: 10,
  desember: 11, december: 11, des: 11, dec: 11
};

const monthNumMap = {
  januari: '01', january: '01', jan: '01',
  februari: '02', february: '02', feb: '02',
  maret: '03', march: '03', mar: '03',
  april: '04', apr: '04',
  mei: '05', may: '05',
  juni: '06', june: '06', jun: '06',
  juli: '07', july: '07', jul: '07',
  agustus: '08', august: '08', ags: '08', aug: '08',
  september: '09', sep: '09',
  oktober: '10', october: '10', okt: '10', oct: '10',
  november: '11', nov: '11',
  desember: '12', december: '12', des: '12', dec: '12'
};

const formatDate = (d) => {
  return d.toISOString().split('T')[0];
};

/**
 * Quarter start and end months (0-indexed)
 */
const quarterRanges = {
  1: { startMonth: 0, endMonth: 2 },
  2: { startMonth: 3, endMonth: 5 },
  3: { startMonth: 6, endMonth: 8 },
  4: { startMonth: 9, endMonth: 11 }
};

/**
 * Parses query string for complex relative and exact date patterns
 * @param {string} query 
 * @returns {Object} { date, startDate, endDate, period, sinceJoined }
 */
const parseDates = (query) => {
  const normalized = query.toLowerCase();
  let date = null;
  let startDate = null;
  let endDate = null;
  let period = null;
  let sinceJoined = false;

  const today = new Date();
  today.setHours(0,0,0,0);

  // ─── Special: "sejak bergabung" / "since joining" ──────────────
  if (normalized.includes('sejak bergabung') || normalized.includes('since join') || normalized.includes('since hired')) {
    sinceJoined = true;
    return { date, startDate, endDate, period, sinceJoined };
  }

  // ─── 1. Relative "X days ago" / "X hari lalu" ──────────────────
  const agoRegex = /(\d+)\s*(?:hari|day)s?\s*(?:lalu|ago|yang\s*lalu)/i;
  const agoMatch = query.match(agoRegex);
  if (agoMatch) {
    const days = parseInt(agoMatch[1], 10);
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - days);
    date = formatDate(targetDate);
    return { date, startDate, endDate, period, sinceJoined };
  }

  // ─── 2. Relative "last X days" / "X hari terakhir" ─────────────
  const lastDaysRegex = /(?:last\s*(\d+)\s*days)|(?:(\d+)\s*hari\s*terakhir)/i;
  const lastDaysMatch = query.match(lastDaysRegex);
  if (lastDaysMatch) {
    const days = parseInt(lastDaysMatch[1] || lastDaysMatch[2], 10);
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - days + 1); // include today
    startDate = formatDate(targetDate);
    endDate = formatDate(today);
    return { date, startDate, endDate, period, sinceJoined };
  }

  // ─── 3. Quarter: "Q1 2025", "Q3 tahun lalu", "kuartal 2" ──────
  const quarterRegex = /(?:q|kuartal|quarter)\s*(\d)\s*(?:tahun\s*(?:lalu|ini))?(?:\s*(\d{4}))?/i;
  const quarterMatch = query.match(quarterRegex);
  if (quarterMatch) {
    const q = parseInt(quarterMatch[1], 10);
    let year = quarterMatch[2] ? parseInt(quarterMatch[2], 10) : today.getFullYear();
    
    // Handle "tahun lalu"
    if (normalized.includes('tahun lalu') || normalized.includes('last year')) {
      year = today.getFullYear() - 1;
    }

    if (q >= 1 && q <= 4) {
      const range = quarterRanges[q];
      const qStart = new Date(year, range.startMonth, 1);
      const qEnd = new Date(year, range.endMonth + 1, 0); // last day of end month
      startDate = formatDate(qStart);
      endDate = formatDate(qEnd);
      return { date, startDate, endDate, period, sinceJoined };
    }
  }

  // ─── 4. "tahun ini" / "this year" / "tahun lalu" / "last year" ─
  if (normalized.includes('tahun ini') || normalized.includes('this year')) {
    const firstDay = new Date(today.getFullYear(), 0, 1);
    startDate = formatDate(firstDay);
    endDate = formatDate(today);
    return { date, startDate, endDate, period, sinceJoined };
  }
  if (normalized.includes('tahun lalu') || normalized.includes('last year')) {
    const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31);
    startDate = formatDate(lastYearStart);
    endDate = formatDate(lastYearEnd);
    return { date, startDate, endDate, period, sinceJoined };
  }

  // ─── 5. Early/Start of this month ──────────────────────────────
  if (normalized.includes('awal bulan ini') || normalized.includes('start of this month')) {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    startDate = formatDate(firstDay);
    endDate = formatDate(today);
    return { date, startDate, endDate, period, sinceJoined };
  }

  if (normalized.includes('akhir bulan lalu') || normalized.includes('end of last month')) {
    const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    startDate = formatDate(firstDayLastMonth);
    endDate = formatDate(lastDayLastMonth);
    return { date, startDate, endDate, period, sinceJoined };
  }

  // ─── 6. Dual month range: "Januari sampai Maret 2026" ─────────
  const monthNames = Object.keys(monthMap).join('|');
  const dualMonthRegex = new RegExp(`(${monthNames})\\s*(?:sampai|hingga|s\\/d|to|through|-)\\s*(${monthNames})\\s*(\\d{4})?`, 'i');
  const dualMonthMatch = query.match(dualMonthRegex);
  if (dualMonthMatch) {
    const startMonthName = dualMonthMatch[1].toLowerCase();
    const endMonthName = dualMonthMatch[2].toLowerCase();
    const year = parseInt(dualMonthMatch[3] || today.getFullYear(), 10);

    const startMonthIdx = monthMap[startMonthName];
    const endMonthIdx = monthMap[endMonthName];

    if (startMonthIdx !== undefined && endMonthIdx !== undefined) {
      const rangeStart = new Date(year, startMonthIdx, 1);
      const rangeEnd = new Date(year, endMonthIdx + 1, 0);
      startDate = formatDate(rangeStart);
      endDate = formatDate(rangeEnd);
      return { date, startDate, endDate, period, sinceJoined };
    }
  }

  // ─── 7. "antara tanggal X sampai Y [Bulan] [Tahun]" ───────────
  const rangeRegex = /(?:antara\s+tanggal\s+(\d+)\s*(?:sampai|-|dan)\s+(\d+)\s+([A-Za-z]+)\s*(\d{4})?)|(?:between\s+(\d+)\s*(?:and|-)\s+(\d+)\s+([A-Za-z]+)\s*(\d{4})?)/i;
  const rangeMatch = query.match(rangeRegex);
  if (rangeMatch) {
    const startDay = parseInt(rangeMatch[1] || rangeMatch[5], 10);
    const endDay = parseInt(rangeMatch[2] || rangeMatch[6], 10);
    const mName = (rangeMatch[3] || rangeMatch[7]).toLowerCase();
    const year = parseInt(rangeMatch[4] || rangeMatch[8] || today.getFullYear(), 10);

    const monthIndex = monthMap[mName];
    if (monthIndex !== undefined) {
      const sDate = new Date(year, monthIndex, startDay);
      const eDate = new Date(year, monthIndex, endDay);
      startDate = formatDate(sDate);
      endDate = formatDate(eDate);
      return { date, startDate, endDate, period, sinceJoined };
    }
  }

  // ─── 8. Normal relative dates ──────────────────────────────────
  if (normalized.includes('hari ini') || normalized.includes('today')) {
    date = formatDate(today);
  } else if (normalized.includes('kemarin') || normalized.includes('yesterday')) {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    date = formatDate(yesterday);
  } else if (normalized.includes('besok') || normalized.includes('tomorrow')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    date = formatDate(tomorrow);
  } else if (normalized.includes('minggu ini') || normalized.includes('this week')) {
    const currentDay = today.getDay();
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(today);
    monday.setDate(today.getDate() + distanceToMonday);
    startDate = formatDate(monday);
    endDate = formatDate(today);
  } else if (normalized.includes('minggu lalu') || normalized.includes('last week')) {
    const currentDay = today.getDay();
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() + distanceToMonday - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    startDate = formatDate(lastMonday);
    endDate = formatDate(lastSunday);
  } else if (normalized.includes('bulan ini') || normalized.includes('this month')) {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    startDate = formatDate(firstDay);
    endDate = formatDate(today);
  } else if (normalized.includes('bulan lalu') || normalized.includes('last month')) {
    const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    startDate = formatDate(firstDayLastMonth);
    endDate = formatDate(lastDayLastMonth);
  }

  // ─── 9. Exact YYYY-MM-DD ──────────────────────────────────────
  const yyyymmdd = query.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (yyyymmdd) {
    date = yyyymmdd[0];
  }

  // ─── 10. Exact DD-MM-YYYY ─────────────────────────────────────
  const ddmmyyyy = query.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);
  if (ddmmyyyy) {
    date = `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }

  // ─── 11. Month Payroll Period (e.g. Mei 2026, 2026-05) ────────
  const monthRegex = new RegExp(`(${monthNames})\\s*(\\d{4})`, 'i');
  const monthMatch = query.match(monthRegex);
  if (monthMatch) {
    const mName = monthMatch[1].toLowerCase();
    const year = monthMatch[2];
    const monthNum = monthNumMap[mName];
    if (monthNum) {
      period = `${year}-${monthNum}`;
    }
  }

  const yyyymm = query.match(/\b(\d{4})-(\d{2})\b/);
  if (yyyymm && !query.match(/\b\d{4}-\d{2}-\d{2}\b/)) {
    period = yyyymm[0];
  }

  return { date, startDate, endDate, period, sinceJoined };
};

module.exports = {
  parseDates
};
