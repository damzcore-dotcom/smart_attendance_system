/**
 * Offline attendance sync — single source of truth for the encrypted
 * `pending_sync` queue used when an employee scans while offline.
 *
 * Previously this logic was duplicated in Scan.jsx (encrypt-aware) and
 * EmployeeHome.jsx (plain JSON.parse). After Scan.jsx started ENCRYPTING the
 * queue, EmployeeHome could no longer read it (JSON.parse on ciphertext throws),
 * so offline records silently failed to sync from the home screen
 * (PERBAIKAN_MODE_KARYAWAN.md #1). Centralizing here keeps both screens in sync.
 */
import { encryptData, decryptData } from './cryptoUtils';
import { attendanceAPI } from '../services/api';

const STORAGE_KEY = 'pending_sync';

const getSecret = () => sessionStorage.getItem('accessToken') || 'fallback-secret';

/**
 * Read & decrypt the pending queue. Falls back to plaintext for any legacy
 * (pre-encryption) data, and to [] on any corruption.
 * @returns {Promise<Array>}
 */
export async function getPendingRecords() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const decrypted = await decryptData(raw, getSecret());
    const parsed = JSON.parse(decrypted);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Legacy plaintext fallback
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

/**
 * Encrypt & persist the pending queue (or clear it when empty).
 * @param {Array} records
 */
export async function savePendingRecords(records) {
  if (!records || records.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const encrypted = await encryptData(JSON.stringify(records), getSecret());
  localStorage.setItem(STORAGE_KEY, encrypted);
}

/**
 * Append a single attendance record to the offline queue.
 * @param {object} record - { type:'IN'|'OUT', employeeId, mode, lat, lng, accuracy, timestamp, photoData }
 */
export async function queuePendingRecord(record) {
  const records = await getPendingRecords();
  records.push(record);
  await savePendingRecords(records);
}

/**
 * Try to flush the offline queue to the server. No-op when offline or empty.
 * Records that fail are kept for the next attempt.
 * @returns {Promise<{ synced: number, remaining: number }>}
 */
export async function syncPendingAttendance() {
  if (!navigator.onLine) return { synced: 0, remaining: 0 };

  const pending = await getPendingRecords();
  if (pending.length === 0) return { synced: 0, remaining: 0 };

  const remaining = [];
  let synced = 0;

  for (const record of pending) {
    try {
      if (record.type === 'OUT') {
        // Pass the original timestamp so the synced check-out keeps the real
        // time it happened, not the time it was uploaded (PERBAIKAN_MODE_KARYAWAN.md #2).
        await attendanceAPI.checkOut(record.employeeId, record.photoData, record.lat, record.lng, record.timestamp);
      } else {
        await attendanceAPI.checkIn(
          record.employeeId,
          record.mode,
          record.lat,
          record.lng,
          record.accuracy,
          record.timestamp,
          record.photoData
        );
      }
      synced++;
    } catch (err) {
      console.error('[offlineSync] Failed to sync record:', err);
      remaining.push(record);
    }
  }

  await savePendingRecords(remaining);
  return { synced, remaining: remaining.length };
}
