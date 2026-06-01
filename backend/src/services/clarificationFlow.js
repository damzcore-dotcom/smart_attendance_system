/**
 * @module clarificationFlow
 * @description Handles ambiguous chatbot inputs by generating context-aware
 * clarifying questions. Supports bilingual (Indonesian / English) output and
 * covers four ambiguity scenarios: low confidence, missing dates, ambiguous
 * employee names, and competing intents.
 */

'use strict';

const { resolveEmployeeName } = require('./entityResolver');

// ─── Intent Label Maps ───────────────────────────────────────────────────────

/**
 * Human-readable intent labels keyed by internal intent name.
 * Each entry has Indonesian (id) and English (en) variants.
 * @type {Record<string, { id: string, en: string }>}
 */
const INTENT_LABELS = {
  attendance_check:   { id: 'Cek kehadiran',          en: 'Check attendance' },
  attendance_summary: { id: 'Ringkasan kehadiran',    en: 'Attendance summary' },
  leave_request:      { id: 'Pengajuan cuti/izin',    en: 'Leave request' },
  leave_status:       { id: 'Status cuti/izin',       en: 'Leave status' },
  leave_balance:      { id: 'Sisa cuti',              en: 'Leave balance' },
  payroll_info:       { id: 'Informasi penggajian',   en: 'Payroll information' },
  payroll_slip:       { id: 'Slip gaji',              en: 'Pay slip' },
  employee_info:      { id: 'Info karyawan',          en: 'Employee information' },
  schedule_info:      { id: 'Info jadwal',             en: 'Schedule information' },
  greeting:           { id: 'Salam / sapaan',         en: 'Greeting' },
  help:               { id: 'Bantuan',                en: 'Help' },
  unknown:            { id: 'Tidak diketahui',        en: 'Unknown' },
};

/** Intents that typically require a date/period */
const DATE_SENSITIVE_INTENTS = new Set([
  'attendance_check',
  'attendance_summary',
  'leave_status',
  'payroll_info',
  'payroll_slip',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable label for an intent, falling back to the raw key.
 * @param {string} intent
 * @param {boolean} isEnglish
 * @returns {string}
 */
function intentLabel(intent, isEnglish) {
  const entry = INTENT_LABELS[intent];
  if (!entry) return intent;
  return isEnglish ? entry.en : entry.id;
}

/**
 * Returns the top-N intents (sorted by score descending) from a score map.
 * @param {Record<string, number>} allScores
 * @param {number} n
 * @returns {Array<{ intent: string, score: number }>}
 */
function topIntents(allScores, n) {
  return Object.entries(allScores || {})
    .map(([intent, score]) => ({ intent, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// ─── Ambiguity Checks ────────────────────────────────────────────────────────

/**
 * @typedef {Object} ClarificationResult
 * @property {boolean}  needsClarification - Whether clarification is needed
 * @property {string}   [question]         - The clarifying question to present
 * @property {string[]} [options]          - Suggested answer options
 */

/**
 * Examines the parsed intent and entities for ambiguity and, when found,
 * produces a clarifying question for the user.
 *
 * Checks are evaluated in priority order:
 * 1. **Low confidence** — maxScore < 0.5 or exactly 0
 * 2. **Competing intents** — top-2 intents within 20% of each other
 * 3. **Missing date** — date-sensitive intent with no extracted date entity
 * 4. **Ambiguous employee name** — fuzzy match confidence 0.5 < c < 0.8
 *
 * @param {string} intent             - Best-matched intent name
 * @param {number} maxScore           - Confidence score of the best intent [0–1]
 * @param {Record<string, number>} allScores - Map of all intent scores
 * @param {Object} extractedEntities  - Entities extracted from user input
 * @param {string} [extractedEntities.employeeName] - Detected employee name
 * @param {string} [extractedEntities.date]          - Detected date / period
 * @param {boolean} isEnglish         - Whether to respond in English
 * @returns {Promise<ClarificationResult>}
 *
 * @example
 * const result = await checkAmbiguity('attendance_check', 0.35, scores, {}, false);
 * // { needsClarification: true, question: '...', options: [...] }
 */
async function checkAmbiguity(intent, maxScore, allScores, extractedEntities, isEnglish) {
  try {
    const entities = extractedEntities || {};

    // ── 1. Low confidence ──────────────────────────────────────────────────
    if (maxScore < 0.5 || maxScore === 0) {
      const top3 = topIntents(allScores, 3);
      const options = top3.length > 0
        ? top3.map((t) => intentLabel(t.intent, isEnglish))
        : [
            intentLabel('attendance_check', isEnglish),
            intentLabel('leave_status', isEnglish),
            intentLabel('payroll_info', isEnglish),
          ];

      return {
        needsClarification: true,
        question: isEnglish
          ? "I'm not sure what you're looking for. Which of these best describes your request?"
          : 'Maaf, saya kurang yakin dengan maksud Anda. Mana yang paling sesuai dengan permintaan Anda?',
        options,
      };
    }

    // ── 2. Competing intents (top 2 within 20% of each other) ──────────
    const top2 = topIntents(allScores, 2);
    if (
      top2.length >= 2 &&
      top2[0].score > 0 &&
      (top2[0].score - top2[1].score) / top2[0].score <= 0.2
    ) {
      return {
        needsClarification: true,
        question: isEnglish
          ? 'Your request could mean a few things. Which one did you mean?'
          : 'Permintaan Anda bisa berarti beberapa hal. Yang mana yang Anda maksud?',
        options: top2.map((t) => intentLabel(t.intent, isEnglish)),
      };
    }

    // ── 3. Missing date for date-sensitive intents ─────────────────────
    if (DATE_SENSITIVE_INTENTS.has(intent) && !entities.date) {
      return {
        needsClarification: true,
        question: isEnglish
          ? 'For which period would you like to check?'
          : 'Untuk periode kapan yang ingin Anda cek?',
        options: isEnglish
          ? ['Today', 'This week', 'This month']
          : ['Hari ini', 'Minggu ini', 'Bulan ini'],
      };
    }

    // ── 4. Ambiguous employee name ─────────────────────────────────────
    if (entities.employeeName) {
      const resolved = await resolveEmployeeName(entities.employeeName);

      if (resolved && resolved.confidence < 0.8 && resolved.confidence > 0.5) {
        // Gather additional close candidates for the user to pick from
        const candidates = await _gatherCandidates(entities.employeeName, resolved);

        return {
          needsClarification: true,
          question: isEnglish
            ? `Did you mean "${resolved.matchedName}"? Or perhaps one of the following?`
            : `Apakah yang Anda maksud "${resolved.matchedName}"? Atau mungkin salah satu dari berikut?`,
          options: candidates,
        };
      }
    }

    // ── No ambiguity detected ──────────────────────────────────────────
    return { needsClarification: false };
  } catch (err) {
    console.error('[clarificationFlow] Error in checkAmbiguity:', err.message);
    // Fail open — don't block the conversation because of an internal error
    return { needsClarification: false };
  }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Gathers a short list of candidate names that are close to the user's input.
 * Always includes the best match first.
 *
 * @param {string} inputName       - The raw input name
 * @param {Object} bestMatch       - The best resolved match
 * @param {string} bestMatch.matchedName
 * @returns {Promise<string[]>}
 * @private
 */
async function _gatherCandidates(inputName, bestMatch) {
  // We use resolveMultipleNames' underlying cache indirectly.
  // Since the cache is a Map and we already have the best match,
  // we just present it plus a "none of the above" option.
  const candidates = [bestMatch.matchedName];

  // Try slight variations (first-name only, last-name only)
  const parts = inputName.trim().split(/\s+/);
  if (parts.length > 1) {
    const { resolveEmployeeName: resolve } = require('./entityResolver');
    for (const part of parts) {
      if (part.length < 2) continue;
      const alt = await resolve(part);
      if (alt && alt.matchedName !== bestMatch.matchedName && alt.confidence > 0.5) {
        candidates.push(alt.matchedName);
        if (candidates.length >= 3) break;
      }
    }
  }

  return candidates;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  checkAmbiguity,
};
