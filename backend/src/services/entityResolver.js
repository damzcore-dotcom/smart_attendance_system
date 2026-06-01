/**
 * @module entityResolver
 * @description Fuzzy matching service for employee names using Levenshtein distance
 * and trigram similarity. Provides name resolution with confidence scoring,
 * honorific stripping, and automatic cache refresh from the database.
 */

'use strict';

const prisma = require('../prismaClient');

// ─── Cache ───────────────────────────────────────────────────────────────────

/** @type {Map<string, { id: number, name: string, nik: string, employeeCode: string }>} */
let employeeCache = new Map();

/** @type {NodeJS.Timeout|null} */
let refreshTimer = null;

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Minimum similarity threshold for fuzzy matches */
const FUZZY_THRESHOLD = 0.65;

/** Honorific prefixes to strip (Indonesian + English, case-insensitive) */
const HONORIFICS = /^(pak|bu|mas|mbak|bapak|ibu|mr\.?|mrs\.?|ms\.?)\s+/i;

// ─── String Utilities ────────────────────────────────────────────────────────

/**
 * Normalises a string for comparison: lowercase, trimmed, collapsed whitespace.
 * @param {string} str
 * @returns {string}
 */
function normalise(str) {
  return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Strips known honorific titles from the beginning of a name.
 * @param {string} input
 * @returns {string}
 */
function stripHonorifics(input) {
  return (input || '').replace(HONORIFICS, '').trim();
}

// ─── Levenshtein Distance ────────────────────────────────────────────────────

/**
 * Computes the Levenshtein edit distance between two strings using the
 * Wagner-Fischer dynamic-programming algorithm with a single-row optimisation.
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} The edit distance (0 = identical)
 *
 * @example
 * levenshteinDistance('kitten', 'sitting'); // 3
 */
function levenshteinDistance(a, b) {
  const la = a.length;
  const lb = b.length;

  if (la === 0) return lb;
  if (lb === 0) return la;

  // Single-row DP optimisation
  const row = Array.from({ length: lb + 1 }, (_, i) => i);

  for (let i = 1; i <= la; i++) {
    let prev = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(
        row[j] + 1,        // deletion
        prev + 1,           // insertion
        row[j - 1] + cost   // substitution
      );
      row[j - 1] = prev;
      prev = val;
    }
    row[lb] = prev;
  }

  return row[lb];
}

/**
 * Returns a normalised Levenshtein similarity in the range [0, 1].
 * 1 = identical, 0 = completely different.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshteinSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// ─── Trigram Similarity ──────────────────────────────────────────────────────

/**
 * Generates the set of character trigrams for a given string.
 * Pads the string with leading/trailing spaces so edge characters get
 * represented, matching PostgreSQL `pg_trgm` behaviour.
 *
 * @param {string} str
 * @returns {Set<string>}
 *
 * @example
 * trigrams('cat'); // Set { '  c', ' ca', 'cat', 'at ' }
 */
function trigrams(str) {
  const padded = `  ${str} `;
  const result = new Set();
  for (let i = 0; i <= padded.length - 3; i++) {
    result.add(padded.substring(i, i + 3));
  }
  return result;
}

/**
 * Computes the trigram similarity between two strings (Dice coefficient variant).
 * Returns a value in the range [0, 1].
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function trigramSimilarity(a, b) {
  const ta = trigrams(a);
  const tb = trigrams(b);

  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;

  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }

  // Jaccard-style coefficient (matches pg_trgm)
  return intersection / (ta.size + tb.size - intersection);
}

// ─── Combined Similarity ────────────────────────────────────────────────────

/**
 * Computes a combined similarity score using both Levenshtein and trigram
 * methods. Levenshtein captures small edits well; trigrams capture
 * reordering and partial matches.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Combined similarity in [0, 1]
 */
function combinedSimilarity(a, b) {
  const levSim = levenshteinSimilarity(a, b);
  const triSim = trigramSimilarity(a, b);
  // Weighted blend: Levenshtein 40%, trigram 60%
  return levSim * 0.4 + triSim * 0.6;
}

// ─── Cache Management ────────────────────────────────────────────────────────

/**
 * Loads all active employees from the database into the in-memory cache.
 * Automatically schedules the next refresh after CACHE_TTL_MS.
 *
 * @returns {Promise<void>}
 */
async function refreshCache() {
  try {
    const employees = await prisma.employee.findMany({
      select: { id: true, name: true, employeeCode: true },
      where: { status: 'ACTIVE' },
    });

    const newCache = new Map();
    for (const emp of employees) {
      const key = normalise(emp.name);
      newCache.set(key, { id: emp.id, name: emp.name, nik: emp.employeeCode, employeeCode: emp.employeeCode });
    }

    employeeCache = newCache;

    // Re-schedule auto-refresh
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshCache().catch((err) =>
        console.error('[entityResolver] Auto-refresh failed:', err.message)
      );
    }, CACHE_TTL_MS);

    // Allow the timer to not keep the process alive
    if (refreshTimer && typeof refreshTimer.unref === 'function') {
      refreshTimer.unref();
    }
  } catch (err) {
    console.error('[entityResolver] Failed to refresh employee cache:', err.message);
    throw err;
  }
}

/**
 * Ensures the cache is populated. Called lazily on first resolution.
 * @returns {Promise<void>}
 */
async function ensureCache() {
  if (employeeCache.size === 0) {
    await refreshCache();
  }
}

// ─── Name Resolution ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} ResolvedEmployee
 * @property {string}  matchedName  - The canonical employee name from DB
 * @property {number}  confidence   - Similarity score in [0, 1]
 * @property {number}  employeeId   - Database primary key
 * @property {string}  nik          - Employee identification number
 */

/**
 * Resolves a single employee name from free-text input.
 *
 * Resolution strategy:
 * 1. Strip honorific prefixes
 * 2. Attempt exact (case-insensitive) match
 * 3. Fall back to fuzzy matching with a combined Levenshtein + trigram score
 * 4. Return the best match above the threshold, or null
 *
 * @param {string} input - Raw user input containing an employee name
 * @returns {Promise<ResolvedEmployee|null>}
 *
 * @example
 * const result = await resolveEmployeeName('Pak Budi Santoso');
 * // { matchedName: 'Budi Santoso', confidence: 1, employeeId: 42, nik: 'EMP001' }
 */
async function resolveEmployeeName(input) {
  if (!input || typeof input !== 'string') return null;

  await ensureCache();

  const cleaned = normalise(stripHonorifics(input));
  if (!cleaned) return null;

  // 1. Exact match
  const exact = employeeCache.get(cleaned);
  if (exact) {
    return {
      matchedName: exact.name,
      confidence: 1,
      employeeId: exact.id,
      nik: exact.nik,
      employeeCode: exact.employeeCode,
    };
  }

  // 2. Fuzzy match — scan all entries
  let bestScore = 0;
  let bestMatch = null;

  for (const [key, emp] of employeeCache) {
    const score = combinedSimilarity(cleaned, key);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = emp;
    }
  }

  if (bestMatch && bestScore >= FUZZY_THRESHOLD) {
    return {
      matchedName: bestMatch.name,
      confidence: Math.round(bestScore * 100) / 100,
      employeeId: bestMatch.id,
      nik: bestMatch.nik,
      employeeCode: bestMatch.employeeCode,
    };
  }

  return null;
}

/**
 * Resolves multiple employee names from a single input string.
 *
 * Splits the input on common separators (commas, "dan", "and", "&") and
 * resolves each fragment independently.
 *
 * @param {string} input - Raw input potentially containing several names
 * @returns {Promise<Array<{ input: string, result: ResolvedEmployee|null }>>}
 *
 * @example
 * const results = await resolveMultipleNames('Budi dan Siti');
 * // [
 * //   { input: 'Budi', result: { matchedName: 'Budi Santoso', ... } },
 * //   { input: 'Siti',  result: { matchedName: 'Siti Rahayu', ... } },
 * // ]
 */
async function resolveMultipleNames(input) {
  if (!input || typeof input !== 'string') return [];

  // Split on commas, "dan", "and", "&"
  const fragments = input
    .split(/[,]|\s+(?:dan|and|&)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const results = [];
  for (const fragment of fragments) {
    const result = await resolveEmployeeName(fragment);
    results.push({ input: fragment, result });
  }

  return results;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  resolveEmployeeName,
  resolveMultipleNames,
  refreshCache,
};
