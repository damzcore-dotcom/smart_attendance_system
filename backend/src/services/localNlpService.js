/**
 * Local NLP Service
 * 
 * Rule-based NLP chatbot engine for Smart Attendance Pro.
 * Runs 100% offline without third-party AI APIs.
 * 
 * Features (v2.0):
 * - Keyword-scored intent classification with DB-configurable keywords
 * - Advanced date parsing (dateParser.js)
 * - Fuzzy employee name matching (entityResolver.js)
 * - Multi-turn conversation memory (conversationMemory.js)
 * - Anaphora resolution (pronoun → entity from previous turn)
 * - Multi-clause query splitting ("absensi dan cuti Budi")
 * - Numeric comparator extraction ("lebih dari 3 kali")
 * - Clarification flow for ambiguous inputs (clarificationFlow.js)
 * - Analytics aggregation with summary headers (analyticsAggregator.js)
 * - Role-based bilingual responses (ID for Admin, EN for Manager/Direktur)
 * - Hot-reload keywords from NlpKeywordConfig DB table
 */

// ─── Lazy-loaded dependencies (avoid circular imports) ──────────────────────
const getDatabaseTools = () => {
  return require('./aiAgentService').databaseTools;
};

const conversationMemory = require('./conversationMemory');
const { parseDates } = require('./dateParser');
const { resolveEmployeeName } = require('./entityResolver');
const { checkAmbiguity } = require('./clarificationFlow');
const { aggregateAttendance, aggregatePayroll, aggregateLeave } = require('./analyticsAggregator');

// ─── Tokenizer ──────────────────────────────────────────────────────────────

const tokenize = (text) => {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, ' ')
    .split(/\s+/)
    .filter(w => w.trim().length > 0);
};

// ─── Department Extractor ───────────────────────────────────────────────────

const parseDepartment = (query) => {
  const normalized = query.toLowerCase();
  const depts = ['it', 'hr', 'hrd', 'security', 'satpam', 'produksi', 'accounting', 'keuangan', 'marketing', 'sales'];
  for (const dept of depts) {
    const reg = new RegExp(`\\b${dept}\\b`, 'i');
    if (reg.test(normalized)) {
      if (dept === 'satpam') return 'Security';
      if (dept === 'keuangan') return 'Accounting';
      if (dept === 'hrd') return 'HR';
      return dept.toUpperCase();
    }
  }
  return null;
};

// ─── Status Extractor ───────────────────────────────────────────────────────

const parseStatus = (query) => {
  const normalized = query.toLowerCase();
  if (normalized.includes('aktif') || normalized.includes('active')) return 'ACTIVE';
  if (normalized.includes('cuti') || normalized.includes('leave')) return 'ON_LEAVE';
  if (normalized.includes('keluar') || normalized.includes('berhenti') || normalized.includes('terminated')) return 'TERMINATED';
  if (normalized.includes('disetujui') || normalized.includes('setuju') || normalized.includes('approved')) return 'APPROVED';
  if (normalized.includes('ditolak') || normalized.includes('tolak') || normalized.includes('rejected')) return 'REJECTED';
  if (normalized.includes('menunggu') || normalized.includes('proses') || normalized.includes('pending')) return 'PENDING';
  if (normalized.includes('terlambat') || normalized.includes('telat') || normalized.includes('late')) return 'LATE';
  if (normalized.includes('hadir') || normalized.includes('present')) return 'PRESENT';
  if (normalized.includes('absen') || normalized.includes('mangkir') || normalized.includes('absent')) return 'ABSENT';
  return null;
};

// ─── Employment Type Extractor ──────────────────────────────────────────────

const parseEmploymentType = (query) => {
  const normalized = query.toLowerCase();
  if (normalized.includes('tetap') || normalized.includes('permanent')) return 'TETAP';
  if (normalized.includes('kontrak') || normalized.includes('contract')) return 'KONTRAK';
  if (normalized.includes('harian') || normalized.includes('bhl') || normalized.includes('daily') || normalized.includes('buruh harian')) return 'HARIAN';
  return null;
};

// ─── Employee Name Extractor ────────────────────────────────────────────────

const parseEmployeeName = (query) => {
  const patterns = [
    /karyawan\s+bernama\s+([A-Za-z\s]+)/i,
    /pegawai\s+bernama\s+([A-Za-z\s]+)/i,
    /atas\s+nama\s+([A-Za-z\s]+)/i,
    /untuk\s+([A-Za-z\s]+)/i,
    /dari\s+([A-Za-z\s]+)/i,
    /milik\s+([A-Za-z\s]+)/i,
    /gaji\s+([A-Za-z\s]+)/i,
    /employee\s+named\s+([A-Za-z\s]+)/i,
    /for\s+([A-Za-z\s]+)/i,
    /of\s+([A-Za-z\s]+)/i,
    /by\s+([A-Za-z\s]+)/i
  ];

  for (const pat of patterns) {
    const match = query.match(pat);
    if (match && match[1]) {
      const cleanName = match[1].replace(/(hari ini|kemarin|besok|minggu lalu|minggu ini|bulan lalu|bulan ini|tahun lalu|tahun ini|today|yesterday|tomorrow|this week|last week|this month|last month)/gi, '').trim();
      if (cleanName.length >= 3) {
        return cleanName;
      }
    }
  }

  // Fallback: strip known keywords and return what's left
  let words = query.split(/\s+/);
  const stopWords = new Set([
    'tampilkan', 'lihat', 'cek', 'cari', 'show', 'list', 'daftar', 'data', 'gaji', 'slip', 'payroll',
    'rekap', 'rekapitulasi', 'summary', 'overview', 'detail', 'details', 'rincian', 'profil', 'profile',
    'semua', 'all', 'setiap', 'each', 'info', 'informasi',
    'absen', 'absensi', 'hadir', 'kehadiran', 'presensi', 'masuk', 'pulang', 'terlambat', 'telat', 'denda',
    'cuti', 'izin', 'sakit', 'ijin', 'pengajuan', 'permohonan', 'shift', 'jadwal', 'roster', 'jam', 'kerja',
    'mesin', 'fingerprint', 'sidik', 'jari', 'perangkat', 'status', 'koneksi', 'sync', 'sinkronisasi',
    'audit', 'tindakan', 'aktivitas', 'admin', 'log', 'hari', 'ini', 'kemarin', 'besok', 'minggu', 'lalu',
    'bulan', 'tahun', 'today', 'yesterday', 'tomorrow', 'this', 'week', 'last', 'month', 'active', 'aktif',
    'pending', 'approved', 'rejected', 'disetujui', 'ditolak', 'menunggu', 'tetap', 'kontrak', 'harian', 'bhl',
    'it', 'hr', 'hrd', 'security', 'satpam', 'produksi', 'accounting', 'keuangan', 'marketing', 'sales',
    'siapa', 'saja', 'yang', 'untuk', 'atas', 'nama', 'dari', 'si', 'di', 'ke', 'dengan', 'dan', 'atau',
    'please', 'find', 'get', 'check', 'for', 'of', 'by', 'employee', 'staff', 'manager', 'director', 'admin',
    'berapa', 'bagaimana', 'apakah', 'dia', 'mereka', 'itu', 'tadi', 'nya', 'serta', 'juga', 'plus',
    'how', 'what', 'who', 'when', 'where', 'which', 'he', 'she', 'they', 'them', 'that', 'those', 'also'
  ]);

  const candidateWords = words.filter(w => {
    const clean = w.toLowerCase().replace(/[^a-zA-Z]/g, '');
    return clean.length >= 3 && !stopWords.has(clean);
  });

  if (candidateWords.length > 0) {
    return candidateWords.join(' ');
  }

  return null;
};

// ─── Numeric Comparator Extractor ───────────────────────────────────────────

/**
 * Parse numeric comparators from query
 * Examples: "lebih dari 3 kali", "di atas 30 menit", "kurang dari 5", "more than 10"
 * @param {string} query 
 * @returns {Object|null} { operator, value, unit }
 */
const parseComparator = (query) => {
  const normalized = query.toLowerCase();
  
  const patterns = [
    // Indonesian
    { regex: /lebih\s+dari\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'gt' },
    { regex: /lebih\s+besar\s+dari\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'gt' },
    { regex: /di\s+atas\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'gt' },
    { regex: /melebihi\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'gt' },
    { regex: /minimal\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'gte' },
    { regex: /setidaknya\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'gte' },
    { regex: /paling\s+sedikit\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'gte' },
    { regex: /kurang\s+dari\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'lt' },
    { regex: /di\s+bawah\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'lt' },
    { regex: /maksimal\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'lte' },
    { regex: /tepat\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'eq' },
    // English
    { regex: /more\s+than\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'gt' },
    { regex: /greater\s+than\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'gt' },
    { regex: /above\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'gt' },
    { regex: /over\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'gt' },
    { regex: /at\s+least\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'gte' },
    { regex: /less\s+than\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'lt' },
    { regex: /below\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'lt' },
    { regex: /under\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'lt' },
    { regex: /at\s+most\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'lte' },
    { regex: /exactly\s+(\d+(?:\.\d+)?)\s*(\w+)?/i, operator: 'eq' },
  ];

  for (const { regex, operator } of patterns) {
    const match = normalized.match(regex);
    if (match) {
      let value = parseFloat(match[1]);
      let unit = match[2] || null;
      
      // Handle "rb" / "ribu" abbreviations (50rb = 50000)
      if (unit && (unit === 'rb' || unit === 'ribu' || unit.startsWith('ribu'))) {
        value *= 1000;
        unit = 'rupiah';
      }
      if (unit && (unit === 'jt' || unit === 'juta')) {
        value *= 1000000;
        unit = 'rupiah';
      }
      
      return { operator, value, unit };
    }
  }

  return null;
};

// ─── Anaphora Resolution ────────────────────────────────────────────────────

/**
 * Resolve pronouns and references to entities from previous turns
 * @param {string} message 
 * @param {string} username
 * @returns {string} Resolved message with pronouns replaced
 */
const resolveAnaphora = (message, username) => {
  const normalized = message.toLowerCase();
  
  // Pronouns and reference words to detect
  const pronounPatterns = [
    /\b(dia|nya|orang\s+itu|yang\s+tadi|yang\s+itu|si\s+dia|orangnya)\b/gi,
    /\b(he|she|him|her|them|that\s+person|that\s+one|the\s+same)\b/gi,
    /\b(mereka|they)\b/gi
  ];

  let hasPronouns = false;
  for (const pat of pronounPatterns) {
    if (pat.test(normalized)) {
      hasPronouns = true;
      break;
    }
  }

  if (!hasPronouns) return message;

  // Get last entities from conversation memory
  const lastEntities = conversationMemory.getLastEntities(username);
  
  if (!lastEntities.employeeName) return message; // No entity to resolve to

  let resolved = message;
  
  // Replace pronouns with the last mentioned employee name
  const replacements = [
    { pattern: /\b(dia|nya|orang\s+itu|yang\s+tadi|yang\s+itu|si\s+dia|orangnya)\b/gi, replacement: lastEntities.employeeName },
    { pattern: /\b(he|she|him|her|that\s+person|that\s+one|the\s+same)\b/gi, replacement: lastEntities.employeeName },
  ];

  for (const { pattern, replacement } of replacements) {
    resolved = resolved.replace(pattern, replacement);
  }

  console.log(`🔗 [ANAPHORA] Resolved "${message}" → "${resolved}" (entity: ${lastEntities.employeeName})`);
  return resolved;
};

// ─── Multi-Clause Splitting ─────────────────────────────────────────────────

/**
 * Split compound queries into sub-clauses
 * @param {string} message
 * @returns {string[]} Array of sub-queries (1 if no splitting needed)
 */
const splitMultiClause = (message) => {
  // Conjunctions that indicate multiple intents
  const conjunctionPattern = /\s+(?:dan|serta|juga|plus|and|also|as\s+well\s+as)\s+/i;
  
  // Only split if the message has a conjunction AND is long enough
  if (!conjunctionPattern.test(message) || message.split(/\s+/).length < 5) {
    return [message];
  }

  const parts = message.split(conjunctionPattern).map(p => p.trim()).filter(p => p.length > 2);
  
  if (parts.length < 2) return [message];

  // Carry shared context forward: if last part has no name, inherit from first
  // e.g., "absensi Budi dan cuti" → ["absensi Budi", "cuti Budi"]
  const firstName = parseEmployeeName(parts[0]);
  if (firstName) {
    for (let i = 1; i < parts.length; i++) {
      const partName = parseEmployeeName(parts[i]);
      if (!partName) {
        parts[i] = parts[i] + ' ' + firstName;
      }
    }
  }

  // Carry shared date context
  const firstDates = parseDates(parts[0]);
  const hasFirstDate = firstDates.date || firstDates.startDate || firstDates.period;
  if (hasFirstDate) {
    for (let i = 1; i < parts.length; i++) {
      const partDates = parseDates(parts[i]);
      if (!partDates.date && !partDates.startDate && !partDates.period) {
        // Append original date text (we can't perfectly reconstruct, but the parser will re-parse)
        if (firstDates.date) parts[i] = parts[i] + ' hari ini'; // simplified carry
      }
    }
  }

  console.log(`📋 [MULTI-CLAUSE] Split "${message}" → ${parts.length} clauses:`, parts);
  return parts;
};

// ─── Intent Keywords and Weights ────────────────────────────────────────────

let intentKeywords = [
  {
    intent: 'greeting',
    keywords: ['halo', 'hai', 'selamat', 'pagi', 'siang', 'sore', 'malam', 'hello', 'hi', 'hey', 'assalamualaikum', 'welcome'],
    weight: 1
  },
  {
    intent: 'help',
    keywords: ['bantuan', 'tahu', 'bisa', 'kemampuan', 'fitur', 'menu', 'help', 'info', 'panduan', 'cara', 'manual', 'guide', 'features'],
    weight: 1
  },
  {
    intent: 'getDashboardSummaryStats',
    keywords: ['dashboard', 'ringkasan', 'rekap', 'rekapitulasi', 'statistik', 'summary', 'overview', 'kondisi', 'stats', 'statistics'],
    weight: 2
  },
  {
    intent: 'getEmployeesList',
    keywords: ['karyawan', 'pegawai', 'staff', 'staf', 'pekerja', 'orang', 'list', 'daftar', 'kolega', 'aktif', 'nonaktif', 'employee', 'employees', 'workers', 'active', 'terminated'],
    weight: 1.5
  },
  {
    intent: 'getAttendanceLogs',
    keywords: ['absen', 'absensi', 'hadir', 'kehadiran', 'presensi', 'masuk', 'pulang', 'terlambat', 'telat', 'denda', 'log', 'attendance', 'attendances', 'checkin', 'checkout', 'late', 'lateness', 'penalty', 'penalties', 'logs', 'present', 'absent'],
    weight: 2
  },
  {
    intent: 'getLeaveRequests',
    keywords: ['cuti', 'izin', 'sakit', 'ijin', 'dispensasi', 'pengajuan', 'permohonan', 'leave', 'leaves', 'permit', 'permits', 'sick', 'request', 'requests'],
    weight: 2.5
  },
  {
    intent: 'getEmployeeSalaryAndPayroll',
    keywords: ['gaji', 'slip', 'payroll', 'tunjangan', 'potongan', 'keuangan', 'upah', 'salary', 'salaries', 'payrolls', 'slips', 'allowance', 'allowances', 'deduction', 'deductions', 'pay', 'income'],
    weight: 3
  },
  {
    intent: 'getShiftSchedules',
    keywords: ['shift', 'jadwal', 'roster', 'jam kerja', 'rotasi', 'shifts', 'schedule', 'schedules', 'rosters', 'rotation'],
    weight: 2.5
  },
  {
    intent: 'getFingerprintDevicesStatus',
    keywords: ['fingerprint', 'mesin', 'alat', 'sidik jari', 'perangkat', 'koneksi', 'sync', 'sinkronisasi', 'device', 'devices', 'machine', 'machines', 'connection'],
    weight: 3
  },
  {
    intent: 'getSystemAuditLogs',
    keywords: ['audit', 'tindakan', 'aktivitas', 'log audit', 'modifikasi', 'riwayat perubahan', 'audits', 'action', 'actions', 'activity', 'activities', 'history'],
    weight: 3
  }
];

// ─── Hot-Reload DB Keywords ─────────────────────────────────────────────────

let dbKeywordsLoaded = false;

/**
 * Load custom keywords from NlpKeywordConfig table and merge with hardcoded ones
 */
const reloadKeywords = async () => {
  try {
    const prisma = require('../prismaClient');
    const dbKeywords = await prisma.nlpKeywordConfig.findMany({
      where: { isActive: true }
    });

    if (dbKeywords.length > 0) {
      // Group DB keywords by intent
      const dbGrouped = {};
      dbKeywords.forEach(kw => {
        if (!dbGrouped[kw.intent]) dbGrouped[kw.intent] = [];
        dbGrouped[kw.intent].push({ keyword: kw.keyword, weight: kw.weight });
      });

      // Merge with existing intent keywords
      intentKeywords.forEach(item => {
        if (dbGrouped[item.intent]) {
          dbGrouped[item.intent].forEach(dbKw => {
            if (!item.keywords.includes(dbKw.keyword)) {
              item.keywords.push(dbKw.keyword);
            }
          });
        }
      });

      console.log(`🔄 [NLP] Loaded ${dbKeywords.length} custom keywords from database.`);
    }
    dbKeywordsLoaded = true;
  } catch (error) {
    // Non-critical: DB might not have the table yet (pre-migration)
    console.warn('⚠️ [NLP] Could not load custom keywords from DB:', error.message);
    dbKeywordsLoaded = true;
  }
};

// ─── Intent Classifier ──────────────────────────────────────────────────────

/**
 * Classify query intent based on keyword scoring
 * @param {string} query
 * @returns {{ intent: string, maxScore: number, allScores: Object }}
 */
const classifyIntent = (query) => {
  const normalized = query.toLowerCase();
  const scores = {};

  intentKeywords.forEach(item => {
    scores[item.intent] = 0;
    item.keywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(normalized) || (kw.includes(' ') && normalized.includes(kw))) {
        scores[item.intent] += item.weight;
      }
    });
  });

  // Find max scoring intent
  let bestIntent = 'help';
  let maxScore = 0;

  Object.entries(scores).forEach(([intent, score]) => {
    if (score > maxScore) {
      maxScore = score;
      bestIntent = intent;
    }
  });

  // Fallback threshold
  if (maxScore < 0.8) {
    bestIntent = 'help';
  }

  // Context overriding logic
  if (bestIntent === 'getEmployeesList') {
    if (normalized.includes('gaji') || normalized.includes('payroll') || normalized.includes('slip')) {
      bestIntent = 'getEmployeeSalaryAndPayroll';
    } else if (normalized.includes('absen') || normalized.includes('hadir') || normalized.includes('masuk') || normalized.includes('telat')) {
      bestIntent = 'getAttendanceLogs';
    } else if (normalized.includes('cuti') || normalized.includes('izin') || normalized.includes('sakit')) {
      bestIntent = 'getLeaveRequests';
    } else if (normalized.includes('shift') || normalized.includes('jadwal')) {
      bestIntent = 'getShiftSchedules';
    }
  }

  return { intent: bestIntent, maxScore, allScores: scores };
};

// ─── Post-Processing Filter (Comparator) ───────────────────────────────────

/**
 * Apply comparator filter to result data arrays
 * @param {Array} data 
 * @param {Object} comparator 
 * @param {string} intent
 * @returns {Array} Filtered data
 */
const applyComparatorFilter = (data, comparator, intent) => {
  if (!comparator || !Array.isArray(data)) return data;

  const { operator, value } = comparator;
  
  return data.filter(item => {
    let fieldValue = null;

    // Choose field based on intent
    if (intent === 'getAttendanceLogs') {
      fieldValue = Number(item.keterlambatanMenit || item.dendaKeterlambatanMenit || 0);
    } else if (intent === 'getEmployeeSalaryAndPayroll') {
      fieldValue = Number(item.gajiBersih || item.gajiKotor || 0);
    }

    if (fieldValue === null) return true;

    switch (operator) {
      case 'gt': return fieldValue > value;
      case 'gte': return fieldValue >= value;
      case 'lt': return fieldValue < value;
      case 'lte': return fieldValue <= value;
      case 'eq': return fieldValue === value;
      default: return true;
    }
  });
};

// ─── Response Formatter ─────────────────────────────────────────────────────

const formatResult = (intent, data, isEnglish, queryParams) => {
  if (data && data.error) {
    return isEnglish 
      ? `⚠️ **Access Denied / Error:** ${data.error}`
      : `⚠️ **Akses Ditolak / Kesalahan:** ${data.error}`;
  }

  if (data && data.message) {
    return `ℹ️ ${data.message}`;
  }

  switch (intent) {
    case 'greeting':
      return isEnglish 
        ? "👋 **Hello!** I am the Smart HRIS AI Assistant (Offline Mode). How can I assist you with employee database, attendance records, leaves, or shift rosters today? Type *'help'* to see what I can do!"
        : "👋 **Halo!** Saya adalah Asisten AI Smart HRIS (Mode Offline). Bagaimana saya bisa membantu Anda mengelola data karyawan, absensi, cuti/izin, atau jadwal shift hari ini? Ketik *'bantuan'* untuk melihat kemampuan saya!";

    case 'help':
      if (isEnglish) {
        return `Here are the queries you can ask me:
- **Employee Database**: *'list of active employees'*, *'IT department employees'*, *'show daily workers (BHL)'*
- **Attendance & Penalties**: *'who is late today?'*, *'attendance log for Budi yesterday'*, *'lateness details'*
- **Leaves & Permits**: *'who is on leave this week?'*, *'list pending leave requests'*
- **Salary & Payroll** *(Authorized roles only)*: *'salary roster for 2026-05'*, *'salary details for Tarjono'*
- **Work Schedules**: *'shift schedules in IT department'*, *'work shift for Akbar'*
- **Fingerprint Machines**: *'show fingerprint device status'*
- **Audit Logs** *(Admin/Directors only)*: *'admin activity logs'*, *'delete actions'*
- **Summary**: *'today overview'* or *'dashboard summary'*

💡 **Tips**: I understand follow-up questions! After asking about someone, you can ask *"how about his leave?"* and I'll know who you mean.

Feel free to ask in English or Indonesian!`;
      } else {
        return `Berikut adalah beberapa hal yang bisa Anda tanyakan kepada saya:
- **Data Karyawan**: *'siapa saja karyawan IT?'*, *'tampilkan karyawan tetap'*, *'daftar buruh harian (BHL)'*
- **Absensi & Denda Keterlambatan**: *'siapa yang telat hari ini?'*, *'log absen Budi minggu lalu'*, *'keterlambatan kemarin'*
- **Cuti & Izin**: *'siapa saja yang cuti minggu ini?'*, *'daftar pengajuan cuti yang pending'*
- **Gaji & Payroll** *(Khusus manajemen)*: *'rekap payroll Mei 2026'*, *'gaji atas nama Tarjono'*
- **Jadwal Shift**: *'jadwal shift departemen Produksi'*, *'shift kerja Akbar'*
- **Mesin Fingerprint**: *'status mesin sidik jari'*
- **Audit Log** *(Khusus Admin/Direktur)*: *'riwayat aktivitas admin'*, *'audit log tindakan hapus'*
- **Ringkasan**: *'rekap hari ini'* atau *'statistik dashboard'*

💡 **Tips**: Saya mengerti percakapan lanjutan! Setelah bertanya tentang seseorang, Anda bisa bertanya *"bagaimana cutinya?"* dan saya tahu siapa yang dimaksud.

Ketik pertanyaan Anda secara bebas dalam Bahasa Indonesia atau Inggris!`;
      }

    case 'getDashboardSummaryStats': {
      const stats = data;
      const att = stats.absensiHariIni || {};
      if (isEnglish) {
        return `### 📊 Dashboard Summary (${att.tanggal || 'Today'})

| Metric | Status / Count |
| :--- | :--- |
| **Total Active Employees** | **${stats.totalKaryawanAktif || 0}** employees |
| &bull; Monthly Staff | ${stats.totalKaryawanBulananAktif || 0} employees |
| &bull; Daily Workers (BHL) | ${stats.totalBhlAktif || 0} employees |
| **Total Departments** | ${stats.totalDepartemen || 0} departments |

**Today's Attendance Logs:**
- **Present / Checked-in:** **${att.hadir || 0}**
- **Late:** **${att.terlambat || 0}** (included in present count)
- **Absent (No-Show):** **${att.absenMangkir || 0}**
- **Leaves / Permits / Sick:** **${att.cutiSakitIzin || 0}**`;
      } else {
        return `### 📊 Ringkasan Dashboard (${att.tanggal || 'Hari Ini'})

| Indikator | Jumlah / Detail |
| :--- | :--- |
| **Total Karyawan Aktif** | **${stats.totalKaryawanAktif || 0}** orang |
| &bull; Karyawan Bulanan | ${stats.totalKaryawanBulananAktif || 0} orang |
| &bull; Buruh Harian Lepas (BHL) | ${stats.totalBhlAktif || 0} orang |
| **Total Departemen** | ${stats.totalDepartemen || 0} |

**Statistik Kehadiran Hari Ini:**
- **Hadir:** **${att.hadir || 0}** orang
- **Terlambat:** **${att.terlambat || 0}** orang (termasuk dalam jumlah hadir)
- **Mangkir (Tanpa Keterangan):** **${att.absenMangkir || 0}** orang
- **Cuti / Sakit / Izin:** **${att.cutiSakitIzin || 0}** orang`;
      }
    }

    case 'getEmployeesList': {
      if (!Array.isArray(data) || data.length === 0) {
        return isEnglish
          ? `🔍 No employees found matching the criteria.`
          : `🔍 Karyawan tidak ditemukan berdasarkan kriteria pencarian tersebut.`;
      }

      // Single result → narrative format
      if (data.length === 1) {
        const emp = data[0];
        return isEnglish
          ? `👤 **${emp.nama}** (${emp.nik})\n- **Department:** ${emp.departemen}\n- **Position:** ${emp.jabatan}\n- **Type:** ${emp.tipeKaryawan}\n- **Status:** ${emp.status}`
          : `👤 **${emp.nama}** (${emp.nik})\n- **Departemen:** ${emp.departemen}\n- **Jabatan:** ${emp.jabatan}\n- **Tipe:** ${emp.tipeKaryawan}\n- **Status:** ${emp.status}`;
      }

      let list = data.slice(0, 15);
      const summary = isEnglish
        ? `> 📋 **Found ${data.length} employees** matching your query.\n\n`
        : `> 📋 **Ditemukan ${data.length} karyawan** sesuai pencarian Anda.\n\n`;

      let md = summary;
      md += isEnglish
        ? `### 👥 Employee Search Results\n\n| No | NIK | Name | Department | Position | Type | Status |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`
        : `### 👥 Hasil Pencarian Karyawan\n\n| No | NIK | Nama | Departemen | Jabatan | Tipe | Status |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      list.forEach((emp, i) => {
        md += `| ${i + 1} | ${emp.nik} | ${emp.nama} | ${emp.departemen} | ${emp.jabatan} | ${emp.tipeKaryawan} | ${emp.status} |\n`;
      });

      if (data.length > 15) {
        md += isEnglish
          ? `\n*Showing 15 of ${data.length}. Refine your query for more specific results.*`
          : `\n*Menampilkan 15 dari ${data.length}. Persempit pencarian untuk hasil lebih spesifik.*`;
      }

      return md;
    }

    case 'getAttendanceLogs': {
      if (!Array.isArray(data) || data.length === 0) {
        // Positive empty message
        const empName = queryParams?.employeeName;
        if (empName) {
          return isEnglish
            ? `🎉 No attendance issues found for **${empName}** in the specified period. Great record!`
            : `🎉 Tidak ditemukan catatan masalah kehadiran untuk **${empName}** pada periode tersebut. Catatan yang bagus!`;
        }
        return isEnglish
          ? `📅 No attendance logs found for the specified criteria.`
          : `📅 Tidak ditemukan log absensi berdasarkan kriteria tersebut.`;
      }

      // Single result → narrative
      if (data.length === 1) {
        const log = data[0];
        return isEnglish
          ? `📅 **Attendance for ${log.nama}** (${log.tanggal})\n- **Check In:** ${log.jamMasuk}\n- **Check Out:** ${log.jamKeluar}\n- **Status:** ${log.statusKehadiran}\n- **Late:** ${log.keterlambatanMenit} min\n- **Penalty:** ${log.dendaKeterlambatanMenit} min`
          : `📅 **Absensi ${log.nama}** (${log.tanggal})\n- **Jam Masuk:** ${log.jamMasuk}\n- **Jam Keluar:** ${log.jamKeluar}\n- **Status:** ${log.statusKehadiran}\n- **Telat:** ${log.keterlambatanMenit} menit\n- **Denda:** ${log.dendaKeterlambatanMenit} menit`;
      }

      // Multi results → table with summary header
      const agg = aggregateAttendance(data);
      const summaryHeader = isEnglish ? `> 📊 ${agg.summaryTextEn}\n\n` : `> 📊 ${agg.summaryTextId}\n\n`;

      let list = data.slice(0, 15);
      let md = summaryHeader;
      md += isEnglish
        ? `### 📅 Attendance Logs\n\n| Date | NIK | Name | Check In | Check Out | Status | Late (Min) | Penalty (Min) |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`
        : `### 📅 Log Absensi\n\n| Tanggal | NIK | Nama | Jam Masuk | Jam Keluar | Status | Telat (Mnt) | Denda (Mnt) |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      list.forEach(log => {
        md += `| ${log.tanggal} | ${log.nik} | ${log.nama} | ${log.jamMasuk} | ${log.jamKeluar} | ${log.statusKehadiran} | ${log.keterlambatanMenit} | ${log.dendaKeterlambatanMenit} |\n`;
      });

      if (data.length > 15) {
        md += isEnglish
          ? `\n*Showing 15 of ${data.length} total logs.*`
          : `\n*Menampilkan 15 dari ${data.length} total log.*`;
      }

      return md;
    }

    case 'getLeaveRequests': {
      if (!Array.isArray(data) || data.length === 0) {
        return isEnglish
          ? `📝 No leave or permit requests found.`
          : `📝 Tidak ditemukan pengajuan cuti atau izin.`;
      }

      if (data.length === 1) {
        const l = data[0];
        return isEnglish
          ? `📝 **Leave Request by ${l.nama}** (${l.nik})\n- **Period:** ${l.tanggalMulai} to ${l.tanggalSelesai}\n- **Type:** ${l.jenisIzin}\n- **Reason:** ${l.alasan}\n- **Status:** **${l.statusPersetujuan}**`
          : `📝 **Pengajuan Cuti/Izin ${l.nama}** (${l.nik})\n- **Periode:** ${l.tanggalMulai} s/d ${l.tanggalSelesai}\n- **Jenis:** ${l.jenisIzin}\n- **Alasan:** ${l.alasan}\n- **Status:** **${l.statusPersetujuan}**`;
      }

      const agg = aggregateLeave(data);
      const summaryHeader = isEnglish ? `> 📊 ${agg.summaryTextEn}\n\n` : `> 📊 ${agg.summaryTextId}\n\n`;

      let list = data.slice(0, 15);
      let md = summaryHeader;
      md += isEnglish
        ? `### 📝 Leave & Permit Requests\n\n| NIK | Name | Period | Type | Reason | Status |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`
        : `### 📝 Pengajuan Cuti & Izin Karyawan\n\n| NIK | Nama | Periode | Jenis | Alasan | Status |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      list.forEach(l => {
        md += `| ${l.nik} | ${l.nama} | ${l.tanggalMulai} to ${l.tanggalSelesai} | ${l.jenisIzin} | ${l.alasan} | **${l.statusPersetujuan}** |\n`;
      });

      return md;
    }

    case 'getEmployeeSalaryAndPayroll': {
      // Bulk payroll
      if (data.periode) {
        const agg = aggregatePayroll(data);
        let md = isEnglish
          ? `> 💰 ${agg.summaryTextEn}\n\n### 💵 Payroll Summary: ${data.periode} (${data.status})\n`
          : `> 💰 ${agg.summaryTextId}\n\n### 💵 Rekapitulasi Gaji: ${data.periode} (${data.status})\n`;

        md += isEnglish
          ? `\n| NIK | Name | Department | Gross Salary | Late Penalty | Net Salary |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`
          : `\n| NIK | Nama | Departemen | Gaji Kotor | Potongan Telat | Gaji Bersih |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

        (data.daftarRincianKaryawan || []).forEach(d => {
          md += `| ${d.nik} | ${d.nama} | ${d.departemen} | Rp ${d.gajiKotor.toLocaleString('id-ID')} | Rp ${d.dendaKehadiran.toLocaleString('id-ID')} | Rp ${d.gajiBersih.toLocaleString('id-ID')} |\n`;
        });

        return md;
      }

      // Single employee salary
      if (data.nama) {
        let md = isEnglish
          ? `### 💵 Salary Profile: ${data.nama} (${data.nik})\n`
          : `### 💵 Informasi Gaji: ${data.nama} (${data.nik})\n`;

        md += isEnglish
          ? `* Position/Dept: ${data.jabatan} / ${data.departemen}
* Salary Model: **${data.tipeGaji}**
* Monthly Base Salary: **Rp ${data.gajiPokokBase.toLocaleString('id-ID')}**
* Daily Rate: **Rp ${data.tarifHarian.toLocaleString('id-ID')}**\n\n`
          : `* Jabatan/Dept: ${data.jabatan} / ${data.departemen}
* Jenis Gaji: **${data.tipeGaji}**
* Gaji Pokok Bulanan: **Rp ${data.gajiPokokBase.toLocaleString('id-ID')}**
* Tarif Harian (BHL): **Rp ${data.tarifHarian.toLocaleString('id-ID')}**\n\n`;

        if (Array.isArray(data.komponenGajiLainnya) && data.komponenGajiLainnya.length > 0) {
          md += isEnglish ? `**Allowances & Deductions:**\n` : `**Tunjangan & Potongan:**\n`;
          data.komponenGajiLainnya.forEach(c => {
            md += `- ${c.name} (${c.type}): **Rp ${c.amount.toLocaleString('id-ID')}**\n`;
          });
          md += `\n`;
        }

        if (Array.isArray(data.riwayatPayrollTerakhir) && data.riwayatPayrollTerakhir.length > 0) {
          md += isEnglish ? `**Recent Payroll History:**\n` : `**Riwayat Payroll Terakhir:**\n`;
          data.riwayatPayrollTerakhir.forEach(r => {
            md += `- ${r.tanggalPencairan} → Gross: **Rp ${r.gajiKotor.toLocaleString('id-ID')}**, Net: **Rp ${r.gajiBersih.toLocaleString('id-ID')}**\n`;
          });
        }

        return md;
      }

      return isEnglish 
        ? "⚠️ No salary details returned. Please verify parameters."
        : "⚠️ Detail gaji kosong. Pastikan parameter nama karyawan terisi.";
    }

    case 'getShiftSchedules': {
      if (!Array.isArray(data) || data.length === 0) {
        return isEnglish ? `🕒 No shift schedules found.` : `🕒 Tidak ada jadwal shift ditemukan.`;
      }

      if (data.length === 1) {
        const s = data[0];
        let ovStr = '-';
        if (Array.isArray(s.overrideShiftTerakhir) && s.overrideShiftTerakhir.length > 0) {
          const o = s.overrideShiftTerakhir[0];
          ovStr = `${o.shift} (${o.dariTanggal} to ${o.sampaiTanggal})`;
        }
        return isEnglish
          ? `🕒 **Shift for ${s.nama}** (${s.nik})\n- **Department:** ${s.departemen}\n- **Primary Shift:** ${s.shiftUtama}\n- **Recent Override:** ${ovStr}`
          : `🕒 **Shift ${s.nama}** (${s.nik})\n- **Departemen:** ${s.departemen}\n- **Shift Utama:** ${s.shiftUtama}\n- **Override Terbaru:** ${ovStr}`;
      }

      let list = data.slice(0, 15);
      let md = isEnglish
        ? `> 📋 **Found ${data.length} shift schedules.**\n\n### 🕒 Shift Schedules\n\n| NIK | Name | Department | Primary Shift | Override |\n| :--- | :--- | :--- | :--- | :--- |\n`
        : `> 📋 **Ditemukan ${data.length} jadwal shift.**\n\n### 🕒 Jadwal Shift Kerja\n\n| NIK | Nama | Departemen | Shift Utama | Override |\n| :--- | :--- | :--- | :--- | :--- |\n`;

      list.forEach(s => {
        let ovStr = '-';
        if (Array.isArray(s.overrideShiftTerakhir) && s.overrideShiftTerakhir.length > 0) {
          const o = s.overrideShiftTerakhir[0];
          ovStr = `${o.shift} (${o.dariTanggal} to ${o.sampaiTanggal})`;
        }
        md += `| ${s.nik} | ${s.nama} | ${s.departemen} | ${s.shiftUtama} | ${ovStr} |\n`;
      });

      return md;
    }

    case 'getFingerprintDevicesStatus': {
      if (!Array.isArray(data) || data.length === 0) {
        return isEnglish ? `🔌 No fingerprint devices registered.` : `🔌 Tidak ada mesin fingerprint terdaftar.`;
      }

      let md = isEnglish
        ? `### 🔌 Fingerprint Device Status\n\n| ID | Name | IP | Connection | Last Sync | Auto-Sync |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`
        : `### 🔌 Status Mesin Fingerprint\n\n| ID | Nama | IP | Koneksi | Terakhir Sync | Auto-Sync |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      data.forEach(d => {
        const connLabel = d.statusKoneksi === 'ONLINE' ? '🟢 ONLINE' : '🔴 OFFLINE';
        md += `| ${d.id} | ${d.namaMesin} | ${d.ipAddress}:${d.port} | ${connLabel} | ${d.terakhirSinkronisasi} | ${d.sinkronisasiOtomatis} |\n`;
      });

      return md;
    }

    case 'getSystemAuditLogs': {
      if (!Array.isArray(data) || data.length === 0) {
        return isEnglish ? `📜 No system audit logs found.` : `📜 Tidak ada log audit sistem ditemukan.`;
      }

      let list = data.slice(0, 15);
      let md = isEnglish
        ? `> 📋 **Found ${data.length} audit log entries.**\n\n### 📜 System Audit Logs\n\n| Date/Time | User | Role | Action | Entity | Description |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`
        : `> 📋 **Ditemukan ${data.length} entri log audit.**\n\n### 📜 Log Audit Sistem\n\n| Waktu | User | Role | Tindakan | Tabel | Deskripsi |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

      list.forEach(l => {
        md += `| ${l.waktu} | ${l.user} | ${l.role} | ${l.tindakan} | ${l.tabelTerdampak} | ${l.rincian} |\n`;
      });

      return md;
    }

    default:
      return isEnglish
        ? "I am not sure how to display this data. Please try another query."
        : "Saya kurang paham cara menampilkan data tersebut. Silakan coba pertanyaan lainnya.";
  }
};

// ─── Execute Single Query ───────────────────────────────────────────────────

/**
 * Execute a single classified intent query
 * @param {string} message Original message text
 * @param {string} intent Classified intent
 * @param {boolean} isEnglish
 * @param {Object} userContext
 * @returns {Promise<string>} Formatted response
 */
const executeSingleQuery = async (message, intent, isEnglish, userContext) => {
  const databaseTools = getDatabaseTools();

  const dates = parseDates(message);
  const department = parseDepartment(message);
  const status = parseStatus(message);
  const employmentType = parseEmploymentType(message);
  let employeeName = parseEmployeeName(message);
  const comparator = parseComparator(message);

  // Try fuzzy resolve employee name if found
  if (employeeName) {
    try {
      const resolved = await resolveEmployeeName(employeeName);
      if (resolved && resolved.confidence >= 0.65) {
        console.log(`🎯 [FUZZY] "${employeeName}" → "${resolved.matchedName}" (confidence: ${resolved.confidence})`);
        employeeName = resolved.matchedName;
      }
    } catch (err) {
      // Non-critical: continue with original name
      console.warn('⚠️ [FUZZY] Entity resolution failed:', err.message);
    }
  }

  console.log(`🤖 [LOCAL CHAT] Intent: ${intent} | Params:`, {
    ...dates,
    department,
    status,
    employmentType,
    employeeName,
    comparator: comparator ? `${comparator.operator} ${comparator.value}` : null
  });

  let resultData = null;

  switch (intent) {
    case 'getDashboardSummaryStats':
      resultData = await databaseTools.getDashboardSummaryStats();
      break;

    case 'getEmployeesList': {
      let empStatus = 'ACTIVE';
      if (status === 'ON_LEAVE' || status === 'TERMINATED') {
        empStatus = status;
      }
      resultData = await databaseTools.getEmployeesList({
        name: employeeName,
        department,
        status: empStatus,
        employmentType
      });
      break;
    }

    case 'getAttendanceLogs': {
      let attStatus = null;
      const msgLower = message.toLowerCase();
      if (msgLower.includes('telat') || msgLower.includes('terlambat') || msgLower.includes('late')) attStatus = 'LATE';
      else if (msgLower.includes('hadir') || msgLower.includes('masuk') || msgLower.includes('present')) attStatus = 'PRESENT';
      else if (msgLower.includes('mangkir') || msgLower.includes('absent')) attStatus = 'ABSENT';
      else if (msgLower.includes('sakit') || msgLower.includes('sick')) attStatus = 'SAKIT';
      else if (msgLower.includes('izin') || msgLower.includes('ijin') || msgLower.includes('permit')) attStatus = 'IZIN';
      else if (msgLower.includes('cuti') || msgLower.includes('leave')) attStatus = 'CUTI';

      resultData = await databaseTools.getAttendanceLogs({
        date: dates.date,
        startDate: dates.startDate,
        endDate: dates.endDate,
        employeeName,
        status: attStatus
      });

      // Apply comparator post-filter
      if (comparator && Array.isArray(resultData)) {
        resultData = applyComparatorFilter(resultData, comparator, intent);
      }
      break;
    }

    case 'getLeaveRequests': {
      let reqStatus = null;
      const msgLower = message.toLowerCase();
      if (msgLower.includes('disetujui') || msgLower.includes('setuju') || msgLower.includes('approved')) reqStatus = 'APPROVED';
      else if (msgLower.includes('ditolak') || msgLower.includes('tolak') || msgLower.includes('rejected')) reqStatus = 'REJECTED';
      else if (msgLower.includes('tunggu') || msgLower.includes('pending') || msgLower.includes('proses')) reqStatus = 'PENDING';

      resultData = await databaseTools.getLeaveRequests({
        status: reqStatus,
        employeeName
      });
      break;
    }

    case 'getEmployeeSalaryAndPayroll': {
      let salaryEmpName = employeeName;
      if (dates.period) {
        if (salaryEmpName && ['rekap', 'payroll', 'gaji', 'summary', 'overview'].includes(salaryEmpName.toLowerCase())) {
          salaryEmpName = null;
        }
      }
      resultData = await databaseTools.getEmployeeSalaryAndPayroll({
        employeeName: salaryEmpName,
        period: dates.period
      }, userContext);
      break;
    }

    case 'getShiftSchedules':
      resultData = await databaseTools.getShiftSchedules({
        employeeName,
        department
      });
      break;

    case 'getFingerprintDevicesStatus':
      resultData = await databaseTools.getFingerprintDevicesStatus();
      break;

    case 'getSystemAuditLogs':
      if (!['SUPER_ADMIN', 'ADMIN', 'DIREKTUR', 'MANAGER'].includes(userContext.role)) {
        return isEnglish
          ? "⚠️ Access denied. Audit logs are restricted to Administrator roles."
          : "⚠️ Akses ditolak. Log audit dibatasi khusus untuk Administrator.";
      }
      resultData = await databaseTools.getSystemAuditLogs({
        username: employeeName,
        action: null
      }, userContext);
      break;

    default:
      return formatResult('help', {}, isEnglish);
  }

  return formatResult(intent, resultData, isEnglish, {
    ...dates,
    department,
    status,
    employmentType,
    employeeName
  });
};

// ─── Main Processing Function ───────────────────────────────────────────────

/**
 * Process a local NLP chat message
 * @param {string} message User's message
 * @param {Array} chatHistory Previous chat history
 * @param {Object} userContext { username, role, employeeId }
 * @returns {Promise<Object>} { reply, intent, confidenceScore }
 */
const processLocalChat = async (message, chatHistory, userContext) => {
  try {
    // Load DB keywords on first call
    if (!dbKeywordsLoaded) {
      await reloadKeywords();
    }

    const isEnglish = userContext.role === 'DIREKTUR' || userContext.role === 'MANAGER';
    
    // ── Step 1: Anaphora Resolution ───────────────────────────────────
    const resolvedMessage = resolveAnaphora(message, userContext.username);
    
    // ── Step 2: Classify Intent ───────────────────────────────────────
    const { intent, maxScore, allScores } = classifyIntent(resolvedMessage);
    
    // ── Step 3: Quick returns for greeting/help ──────────────────────
    if (intent === 'greeting') {
      const reply = formatResult('greeting', {}, isEnglish);
      conversationMemory.addMessage(userContext.username, 'user', message, 'greeting', {});
      conversationMemory.addMessage(userContext.username, 'model', reply);
      return { reply, intent: 'greeting', confidenceScore: maxScore };
    }
    
    if (intent === 'help') {
      // Check clarification flow — maybe user was ambiguous, not asking for help
      if (maxScore > 0 && maxScore < 0.8) {
        const extractedEntities = {
          employeeName: parseEmployeeName(resolvedMessage),
          date: parseDates(resolvedMessage).date || parseDates(resolvedMessage).startDate
        };

        const clarification = await checkAmbiguity(intent, maxScore, allScores, extractedEntities, isEnglish);
        if (clarification.needsClarification) {
          let clarReply = `${clarification.question}\n\n`;
          clarification.options.forEach((opt, i) => {
            clarReply += `${i + 1}. ${opt}\n`;
          });
          
          conversationMemory.addMessage(userContext.username, 'user', message, 'clarification', {});
          conversationMemory.addMessage(userContext.username, 'model', clarReply);
          return { reply: clarReply, intent: 'clarification', confidenceScore: maxScore };
        }
      }

      const reply = formatResult('help', {}, isEnglish);
      conversationMemory.addMessage(userContext.username, 'user', message, 'help', {});
      conversationMemory.addMessage(userContext.username, 'model', reply);
      return { reply, intent: 'help', confidenceScore: maxScore };
    }

    // ── Step 4: Multi-Clause Processing ──────────────────────────────
    const clauses = splitMultiClause(resolvedMessage);
    
    if (clauses.length > 1) {
      // Process each clause independently and combine results
      const results = [];
      for (const clause of clauses) {
        const { intent: clauseIntent } = classifyIntent(clause);
        if (clauseIntent !== 'help' && clauseIntent !== 'greeting') {
          const clauseResult = await executeSingleQuery(clause, clauseIntent, isEnglish, userContext);
          results.push(clauseResult);
        }
      }
      
      if (results.length > 0) {
        const combinedReply = results.join('\n\n---\n\n');
        const params = {
          employeeName: parseEmployeeName(resolvedMessage),
          ...parseDates(resolvedMessage)
        };
        
        conversationMemory.addMessage(userContext.username, 'user', message, intent, params);
        conversationMemory.addMessage(userContext.username, 'model', combinedReply);
        return { reply: combinedReply, intent: 'multi_clause', confidenceScore: maxScore };
      }
    }

    // ── Step 5: Single Intent Processing ─────────────────────────────
    const extractedParams = {
      employeeName: parseEmployeeName(resolvedMessage),
      department: parseDepartment(resolvedMessage),
      status: parseStatus(resolvedMessage),
      employmentType: parseEmploymentType(resolvedMessage),
      ...parseDates(resolvedMessage)
    };

    // Save to conversation memory BEFORE executing (for context tracking)
    conversationMemory.addMessage(userContext.username, 'user', message, intent, extractedParams);

    const reply = await executeSingleQuery(resolvedMessage, intent, isEnglish, userContext);
    
    conversationMemory.addMessage(userContext.username, 'model', reply);
    
    return { reply, intent, confidenceScore: maxScore };

  } catch (error) {
    console.error('Local NLP Chat Processing Error:', error);
    const isEnglish = userContext.role === 'DIREKTUR' || userContext.role === 'MANAGER';
    const reply = isEnglish
      ? `Sorry, an internal error occurred while processing your query: ${error.message}`
      : `Maaf, terjadi kesalahan internal saat memproses pertanyaan Anda: ${error.message}`;
    return { reply, intent: 'error', confidenceScore: 0 };
  }
};

module.exports = {
  processLocalChat,
  classifyIntent,
  parseDates,
  parseEmployeeName,
  parseDepartment,
  parseStatus,
  parseEmploymentType,
  parseComparator,
  resolveAnaphora,
  splitMultiClause,
  reloadKeywords
};
