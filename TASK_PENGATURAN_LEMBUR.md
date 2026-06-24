# Task List — Pengaturan Lembur (Manual / Otomatis + Hari Libur)

> Tujuan: Memberi perusahaan kontrol penuh atas cara perhitungan lembur. Admin dapat memilih
> **mode Manual** (lembur hanya dari input SPL) atau **mode Otomatis** (lembur dihitung sistem
> saat absen pulang berdasar parameter yang bisa diatur, termasuk aturan **lembur di hari libur**).
> Saat absen pulang, sistem **wajib membaca pengaturan ini terlebih dahulu** sebelum menulis `overtimeHours`.

Tanggal dibuat: 2026-06-24

> **Status: SUDAH DIIMPLEMENTASIKAN (2026-06-24).** Keputusan default disepakati:
> lembur hari libur = **Seluruh durasi kerja** (`FULL_WORKED`), pembulatan = **30 menit ke bawah** (`DOWN`).
> Item yang sudah selesai ditandai `[x]`. Item `[ ]` adalah penyempurnaan opsional.

---

## 1. Ringkasan Kondisi Saat Ini (Baseline)

| Aspek | Lokasi | Perilaku sekarang |
| :--- | :--- | :--- |
| Toggle auto/manual | `frontend/src/pages/admin/Settings.jsx:930-939` (tab **Shift Rules**) | Boolean `autoCalculateOvertime` (default ON) |
| Batas lembur | `Settings.jsx:878-897` | `overtimeMaxPerDay` (4), `overtimeMaxPerMonth` (40) — **disimpan tapi tidak dipakai** di checkout |
| Perhitungan checkout | `backend/src/controllers/attendanceController.js:630-651` | `overtimeHours = now - jamPulangShift` jika `autoCalculateOvertime !== 'false'`. Tanpa ambang minimal, tanpa pembulatan, tanpa cap, tanpa logika hari libur |
| Input manual (SPL) | `frontend/src/pages/admin/OvertimeSPL.jsx` → `PATCH /api/attendance/bulk-overtime` (`attendanceController.js:1841`) | Sudah berfungsi |
| Deteksi hari libur | `companyCalendar` (type `HOLIDAY`/`WORKDAY`) + setting `workingDays` (`[1,2,3,4,5]`) + `shift.saturdayType` (`OFF`/`HALF_DAY`/`FULL_DAY`) | Logika `isLibur` sudah ada di `attendanceController.js:251-262` (untuk rekap, belum dipakai di checkout) |

**Masalah utama yang diperbaiki:**
1. Tidak ada pemilihan mode eksplisit (Manual vs Otomatis) yang jelas di UI.
2. Mode otomatis tidak bisa dikonfigurasi (ambang minimal, pembulatan, cap harian tidak diterapkan).
3. Tidak ada perhitungan lembur untuk **hari libur** (di hari libur tidak ada "jam pulang shift", jadi rumus lama menghasilkan 0 / salah).
4. Saat mode Manual, checkout tetap menimpa `overtimeHours` menjadi `0` → menghapus input SPL bila SPL diisi sebelum karyawan absen pulang.

---

## 2. Desain Pengaturan Baru (Setting Keys)

Semua setting tetap memakai tabel key-value `settings` (tidak perlu migrasi schema Prisma).
Tambah/pakai key berikut:

| Key | Tipe (string) | Default | Keterangan |
| :--- | :--- | :--- | :--- |
| `overtimeMode` | `'MANUAL'` \| `'AUTO'` | `'AUTO'` | Mode utama. Menggantikan peran `autoCalculateOvertime` |
| `autoCalculateOvertime` | `'true'`/`'false'` | — | **Tetap disinkronkan** untuk kompatibilitas mundur (`AUTO`→`'true'`, `MANUAL`→`'false'`) |
| `overtimeMinMinutes` | int (menit) | `30` | Lembur baru dihitung jika lewat jam pulang ≥ nilai ini. Di bawahnya = 0 |
| `overtimeRoundingMinutes` | int (menit) | `30` | Kelipatan pembulatan (mis. `30` = pembulatan per ½ jam). `0` = tanpa pembulatan |
| `overtimeRoundingMode` | `'DOWN'`\|`'NEAREST'`\|`'UP'` | `'DOWN'` | Arah pembulatan |
| `overtimeDeductBreak` | `'true'`/`'false'` | `'false'` | Potong durasi istirahat (`breakStart`–`breakEnd` shift) dari jam lembur (relevan utk hari libur penuh) |
| `overtimeMaxPerDay` | int (jam) | `4` | **Mulai diterapkan** sebagai cap di checkout (sudah ada di UI) |
| `overtimeMaxPerMonth` | int (jam) | `40` | Cap akumulasi (validasi di payroll/SPL — opsional di checkout) |
| **Hari Libur** | | | |
| `holidayOvertimeEnabled` | `'true'`/`'false'` | `'true'` | Jika `AUTO`, hitung lembur otomatis saat karyawan masuk di hari libur/istirahat |
| `holidayOvertimeCalcMode` | `'FULL_WORKED'`\|`'AFTER_TIME'` | `'FULL_WORKED'` | `FULL_WORKED` = (jam pulang − jam masuk); `AFTER_TIME` = dihitung setelah `holidayOvertimeStartTime` |
| `holidayOvertimeStartTime` | `'HH:mm'` | `'08:00'` | Dipakai bila mode `AFTER_TIME` |
| `holidayOvertimeMaxHours` | int (jam) | `12` | Cap lembur hari libur |
| `overtimeRateWeekday` | float | `1.5` | (Opsional, untuk payroll) pengali upah lembur hari kerja |
| `overtimeRateHoliday` | float | `2.0` | (Opsional, untuk payroll) pengali upah lembur hari libur |

> Catatan: `overtimeRate*` hanya dipakai oleh modul payroll (perhitungan **nominal**), bukan oleh
> perhitungan **jam** di checkout. Boleh ditunda jika fokus tahap ini hanya jam lembur.

---

## 3. Task List Backend

File utama: `backend/src/controllers/attendanceController.js`

- [x] **B1 — Helper deteksi hari libur.** Buat fungsi `isRestDay(dateObj, { workingDays, calendarOverride, effectiveShift })` yang mengembalikan boolean, dengan prioritas:
  1. `calendarOverride.type === 'WORKDAY'` → **bukan** libur (paksa kerja).
  2. `calendarOverride.type === 'HOLIDAY'` → libur.
  3. Sabtu (`getUTCDay()===6`) & `effectiveShift.saturdayType === 'OFF'` → libur.
  4. Hari tidak termasuk `workingDays` → libur.
  5. Selain itu → bukan libur.
  (Refaktor dari logika `isLibur` yang sudah ada di baris ~251 agar dapat dipakai ulang.)

- [x] **B2 — Helper pembulatan.** Buat `roundOvertime(hours, roundingMinutes, mode)`:
  - `roundingMinutes <= 0` → kembalikan apa adanya (2 desimal).
  - Konversi jam→menit, bulatkan ke kelipatan `roundingMinutes` sesuai `mode` (`DOWN`=floor, `UP`=ceil, `NEAREST`=round), lalu kembalikan ke jam.

- [x] **B3 — Ambil setting & override kalender di `checkOut`.** Di fungsi `checkOut` (`attendanceController.js:532`):
  - Parse semua key baru dari `settingsList` (yang sudah di-fetch di baris 582).
  - Tambah query `companyCalendar.findFirst` untuk `attendance.date` (UTC midnight) → `calendarOverride`.
  - Tentukan `overtimeMode` (fallback: `autoCalculateOvertime === 'false' ? 'MANUAL' : 'AUTO'`).

- [x] **B4 — Ganti blok perhitungan lembur** (`attendanceController.js:630-651`) dengan logika baru (lihat pseudocode §5).
  - **Mode MANUAL:** jangan menimpa `overtimeHours`. Pertahankan nilai lama (`attendance.overtimeHours`) → input SPL aman. Tulis `overtimeHours: attendance.overtimeHours ?? 0`.
  - **Mode AUTO + hari kerja:** `now − expectedEnd`, terapkan `overtimeMinMinutes` (gate), pembulatan, lalu cap `overtimeMaxPerDay`.
  - **Mode AUTO + hari libur:** hanya jika `holidayOvertimeEnabled`; hitung sesuai `holidayOvertimeCalcMode`, potong istirahat bila `overtimeDeductBreak`, cap `holidayOvertimeMaxHours`. Jika `holidayOvertimeEnabled=false` → `overtimeHours = 0`.

- [ ] **B5 — Audit log (opsional tapi disarankan).** Saat checkout menghasilkan lembur > 0 secara otomatis, catat ke audit log (`recordAuditLog`) agar perubahan payroll dapat ditelusuri.

- [ ] **B6 — Konsistensi jalur lain.** Pastikan jalur perhitungan lain yang menimpa `overtimeHours` tidak menabrak mode Manual:
  - `manualUpsert`/koreksi HRD (`attendanceController.js:1697`) — biarkan admin tetap bisa override manual (OK).
  - Sinkronisasi mesin ZK / `bulk` (jika ada penghitungan OT di sana) — terapkan helper yang sama atau set 0 saat MANUAL. (Cek `attendanceController.js:961-1183`.)

- [ ] **B7 — (Opsional) Seed default.** Tambahkan default key baru saat startup/seed agar UI tidak kosong (atau cukup andalkan default di frontend & fallback di backend).

---

## 4. Task List Frontend

File utama: `frontend/src/pages/admin/Settings.jsx` (tab **Shift Rules**, seksi "OT Intel" baris ~875)

- [x] **F1 — Selektor Mode.** Ganti toggle tunggal `autoCalculateOvertime` dengan **segmented control / dropdown** `overtimeMode` (Manual / Otomatis).
  - Saat diubah, set `overtimeMode` **dan** `autoCalculateOvertime` (sinkron) lewat `handleInputChange`.

- [x] **F2 — Panel "Manual".** Jika `overtimeMode === 'MANUAL'`: tampilkan info bahwa lembur diinput via menu **Manajemen Lembur (SPL)** (`OvertimeSPL.jsx`) dan sistem tidak menghitung otomatis saat absen pulang. Sembunyikan parameter otomatis.

- [x] **F3 — Panel "Otomatis".** Jika `overtimeMode === 'AUTO'`, tampilkan input:
  - `overtimeMinMinutes` (number, menit) — "Ambang minimal sebelum dihitung lembur".
  - `overtimeRoundingMinutes` (number) + `overtimeRoundingMode` (select DOWN/NEAREST/UP) — "Pembulatan jam lembur".
  - `overtimeMaxPerDay` (sudah ada) & `overtimeMaxPerMonth` (sudah ada) — pindahkan ke panel ini.
  - `overtimeDeductBreak` (toggle) — "Potong jam istirahat".

- [ ] **F4 — Sub-kartu "Lembur Hari Libur".** Hanya tampil saat `overtimeMode === 'AUTO'`:
  - Toggle `holidayOvertimeEnabled`.
  - Saat ON: `holidayOvertimeCalcMode` (select), `holidayOvertimeStartTime` (time, tampil bila `AFTER_TIME`), `holidayOvertimeMaxHours` (number).

- [ ] **F5 — Default value di state.** Pastikan `formData.<key> || <default>` agar tampil benar saat setting belum tersimpan.

- [ ] **F6 — (Opsional) Tampilkan badge mode** di header tab atau di halaman OvertimeSPL ("Mode Lembur: Manual/Otomatis") agar HRD paham sumber angka lembur.

---

## 5. Logika Perhitungan Checkout (Pseudocode Acuan)

```js
// di dalam checkOut(), menggantikan baris 630-651
let overtimeHours = 0;
const overtimeMode = (autoCalculateOvertime === 'false') ? 'MANUAL'
                   : (settings.overtimeMode || 'AUTO');

if (overtimeMode === 'MANUAL') {
  // Jangan timpa input SPL; pertahankan nilai yang sudah ada
  overtimeHours = attendance.overtimeHours ?? 0;
} else {
  const restDay = isRestDay(attendanceDate, { workingDays, calendarOverride, effectiveShift });

  if (restDay) {
    if (holidayOvertimeEnabled) {
      let mins;
      if (holidayOvertimeCalcMode === 'AFTER_TIME') {
        const startUtc = atTime(attendance.date, holidayOvertimeStartTime, timezoneOffset);
        mins = (now - startUtc) / 60000;
      } else { // FULL_WORKED
        mins = (now - attendance.checkIn) / 60000;
      }
      if (overtimeDeductBreak) mins -= breakDurationMinutes(effectiveShift);
      let h = Math.max(0, mins / 60);
      h = roundOvertime(h, overtimeRoundingMinutes, overtimeRoundingMode);
      overtimeHours = Math.min(h, holidayOvertimeMaxHours);
    } else {
      overtimeHours = 0;
    }
  } else {
    // hari kerja normal
    if (now > expectedEnd) {
      const mins = (now - expectedEnd) / 60000;
      if (mins >= overtimeMinMinutes) {
        let h = roundOvertime(mins / 60, overtimeRoundingMinutes, overtimeRoundingMode);
        overtimeHours = Math.min(h, overtimeMaxPerDay);
      }
    }
  }
}
```

---

## 6. Pengujian (Test Cases)

- [ ] **T1** Mode Manual: karyawan pulang jam 23:00, `overtimeHours` tetap 0 (atau tetap = nilai SPL bila sudah diisi).
- [ ] **T2** Mode Auto, pulang < ambang (mis. 20 menit, min 30) → lembur 0.
- [ ] **T3** Mode Auto, pulang 1 jam 50 menit lewat, pembulatan 30 menit DOWN → 1.5 jam.
- [ ] **T4** Mode Auto, lembur 6 jam dengan cap `overtimeMaxPerDay=4` → 4 jam.
- [ ] **T5** Hari libur (`companyCalendar` HOLIDAY), `holidayOvertimeEnabled=true`, FULL_WORKED 8 jam, potong istirahat 1 jam → 7 jam.
- [ ] **T6** Hari libur, `holidayOvertimeEnabled=false` → lembur 0.
- [ ] **T7** Sabtu shift `saturdayType=OFF` diperlakukan sebagai hari libur (jalur holiday).
- [ ] **T8** `companyCalendar` `WORKDAY` override pada hari Minggu → diperlakukan sebagai hari kerja normal.
- [ ] **T9** Shift malam lintas tengah malam tetap benar (cek `expectedEnd` lintas hari).
- [ ] **T10** Backward compat: data lama yang hanya punya `autoCalculateOvertime='false'` → terbaca sebagai MANUAL.

---

## 7. Kompatibilitas & Migrasi

- [ ] Tidak ada perubahan schema Prisma (semua via tabel `settings`).
- [ ] `autoCalculateOvertime` lama tetap dihormati sebagai fallback → instalasi existing tidak rusak.
- [ ] Saat user menyimpan setting baru, frontend menulis `overtimeMode` **dan** `autoCalculateOvertime` bersamaan.
- [ ] Default backend harus aman bila key belum ada (pakai nilai default di tabel §2).

---

## 8. File yang Terdampak

| File | Perubahan |
| :--- | :--- |
| `backend/src/controllers/attendanceController.js` | Helper `isRestDay`, `roundOvertime`, query `companyCalendar` di `checkOut`, blok perhitungan lembur baru (B1–B6) |
| `frontend/src/pages/admin/Settings.jsx` | Selektor mode + panel parameter otomatis + sub-kartu hari libur (F1–F6) |
| `frontend/src/locales/{id,en,ko,zh}/translation.json` | Key i18n baru di `settingsPage.shifts.*` (label mode, ambang, pembulatan, hari libur) |
| `frontend/src/pages/admin/OvertimeSPL.jsx` | (Opsional F6) badge "Mode Lembur" |
| `TASK_PENGATURAN_LEMBUR.md` | Dokumen ini |

---

## 9. Urutan Pengerjaan yang Disarankan

1. B1, B2 (helper) → B3, B4 (logika checkout) → uji T1–T10.
2. F1–F5 (UI setting) + i18n.
3. F6 & B5 (badge + audit log) — penyempurnaan.
4. (Opsional) `overtimeRate*` untuk integrasi nominal di payroll.
