# Perbaikan Modul Absensi (Pull Data Fingerprint & Ketentuan Absen)

Dokumen ini mencatat hasil analisa mendalam dan perbaikan pada alur **pull data dari mesin
fingerprint (ZKTeco)** serta **logika/ketentuan absensi**. Tujuannya agar ke depan kita tahu
apa yang sudah diperbaiki, kenapa, dan apa yang masih perlu dipantau.

- **Tanggal review:** 23 Juni 2026
- **Cakupan file inti:**
  - `backend/src/utils/zkHelper.js` — wrapper protokol ZKTeco
  - `backend/src/controllers/deviceController.js` — `syncAttendance` (manual + preview) & `commitAttendance`
  - `backend/src/utils/cronJobs.js` — auto-sync absensi tiap menit
  - `backend/src/utils/lateCalculator.js` — perhitungan keterlambatan & status
  - `backend/src/utils/dateHelper.js` — utilitas timezone/tanggal

---

## Ringkasan Arsitektur (konteks)

Pull absensi berjalan lewat **3 jalur** yang sebelumnya menjalankan logika serupa tapi tidak
identik:

1. **Sync manual + preview** → `deviceController.syncAttendance`
2. **Commit dari token preview** → `deviceController.commitAttendance`
3. **Auto-sync cron (tiap menit)** → `cronJobs.js`

Ketiganya: ambil log mesin (`getAttendancesWithRetry`, 3x percobaan) → konversi waktu mesin ke
UTC (`adjustZkTimeToUTC`) → kelompokkan per karyawan per hari → tentukan checkIn/checkOut →
hitung keterlambatan (`calculateLateness`) → tentukan status (`resolveStatus`) → simpan.

Akar masalah utama: ketiga jalur ini **tidak konsisten** satu sama lain, sehingga hasil absen
bisa berbeda tergantung jalur sync mana yang dipakai.

---

## Status Perbaikan

| # | Temuan | Severity | Status |
|---|--------|----------|--------|
| 1 | Ketergantungan timezone server (WIB) untuk penentuan tanggal | 🔴 Kritis | ✅ Selesai |
| 2 | `penaltyRules` tidak diteruskan di sync manual & commit | 🔴 Kritis | ✅ Selesai |
| 3 | Koreksi manual HRD bisa tertimpa sync manual/commit | 🟠 Tinggi | ✅ Selesai |
| 4 | Nilai `mode` tidak konsisten antar jalur (mode preview hilang saat commit) | 🟠 Tinggi | ✅ Selesai |
| 5 | Single-scan bisa salah klasifikasi (masuk/pulang) | 🟡 Sedang | ✅ Selesai (konsolidasi ke 1 helper, perilaku dipertahankan) |
| 6 | Hal-hal minor (string status, anomali tak terlog, log mesin menumpuk) | 🟡 Rendah | ⚙️ Sebagian |

---

## Detail Perbaikan

### 🔴 #1 — Hilangkan ketergantungan timezone server saat menentukan tanggal absen
**Masalah:** `dateKey` (pengelompokan scan per hari) diturunkan dari **waktu lokal server**
(`recordTime.getFullYear()/getMonth()/getDate()`), sementara `calculateLateness` memakai
`getJakartaTime` (Asia/Jakarta). Keduanya hanya cocok jika server berjalan di WIB. Jika server
UTC (mis. container tanpa `TZ`, atau pindah VPS), scan pagi bisa terlempar ke tanggal sebelumnya
dan klasifikasi masuk/pulang kacau.

**Perbaikan:**
- Tambah helper baru `getJakartaDateKey(date)` di `dateHelper.js` → mengembalikan `YYYY-MM-DD`
  pada zona **Asia/Jakarta** secara eksplisit, lepas dari timezone server.
- `deviceController.syncAttendance` dan `cronJobs.js` kini memakai `getJakartaDateKey(recordTime)`
  alih-alih komponen tanggal lokal server.
- `TZ: Asia/Jakarta` sudah ter-set untuk service `backend` di `docker-compose.yml` (tetap
  dipertahankan sebagai lapisan kedua).

**File:** `backend/src/utils/dateHelper.js`, `backend/src/controllers/deviceController.js`,
`backend/src/utils/cronJobs.js`

---

### 🔴 #2 — `penaltyRules` tidak diteruskan di sync manual & commit
**Masalah:** Cron meneruskan `penaltyRules` ke `calculateLateness`, tetapi `syncAttendance` dan
`commitAttendance` **tidak**. Akibatnya penalti tambahan keterlambatan (`rule2AddPenalty` /
`rule2ExtraMinutes`) hanya berlaku saat auto-sync, dan hilang saat HRD sync manual → `lateMinutes`
berbeda tergantung jalur.

**Perbaikan:** Semua pemanggilan `calculateLateness` di `syncAttendance` (perhitungan awal &
recalculation saat merge) dan `commitAttendance` (perhitungan awal & merge) kini meneruskan
`penaltyRules`. Hasil keterlambatan kini identik di seluruh jalur.

**File:** `backend/src/controllers/deviceController.js`

---

### 🟠 #3 — Koreksi manual HRD bisa tertimpa
**Masalah:** Cron memiliki proteksi (melewati record dengan `mode` "Manual…" atau notes
mengandung "HRD"), tetapi `syncAttendance` dan `commitAttendance` **tidak** — keduanya menimpa
record yang sudah dikoreksi manual oleh HRD saat sync ulang rentang tanggal yang sama.

**Perbaikan:**
- Tambah helper bersama `isManualCorrection(record)` di `lateCalculator.js` (satu sumber
  kebenaran: `mode` diawali "Manual" **atau** notes mengandung "HRD").
- Ketiga jalur kini memakai helper yang sama:
  - `syncAttendance`: melewati record jika `isManualCorrection(existingRecord)`.
  - `commitAttendance`: melewati record (via flag `skippedManual` di dalam transaksi) jika manual.
  - `cronJobs`: di-refactor untuk memakai `isManualCorrection` (sebelumnya cek manual ditulis
    inline).

**File:** `backend/src/utils/lateCalculator.js`, `backend/src/controllers/deviceController.js`,
`backend/src/utils/cronJobs.js`

---

### 🟠 #4 — Nilai `mode` tidak konsisten (mode preview hilang saat commit)
**Masalah:** `syncAttendance` menghitung `mode` dari `verifyMode` mesin
(`Fingered`/`Pinned`/`Carded`/`Face Machine`), tetapi `commitAttendance` selalu menulis
`'Fingerprint'` → mode yang ditampilkan di preview hilang saat disimpan. Selain itu `source`
tidak di-set di commit.

**Perbaikan:** `commitAttendance` kini mempertahankan `record.mode` hasil preview
(fallback `'Fingerprint'` untuk token preview lama) dan menyetel `source: 'fingerprint'` —
konsisten dengan jalur sync langsung.

**File:** `backend/src/controllers/deviceController.js`

---

### 🟡 #5 — Klasifikasi single-scan: konsolidasi ke satu helper bersama
**Masalah:** Logika penentuan checkIn/checkOut (termasuk deteksi single-scan via *midpoint*
shift, threshold double-tap, dan penanganan night shift) **ditulis dua kali secara inline** —
di `deviceController.syncAttendance` dan di `cronJobs.js`. Selain duplikasi, ini berisiko kedua
jalur lama-lama **drift** (beda hasil) saat salah satu diubah tanpa yang lain.

**Keputusan kebijakan (HRD):** perilaku klasifikasi **dipertahankan apa adanya** —
1 scan setelah tengah shift tetap diperlakukan sebagai **pulang** (`checkIn=null`), sehingga
`resolveStatus` menghasilkan **MANGKIR**. Ini keputusan bisnis yang diterima, bukan bug
(lihat Catatan #5 di bawah). Yang diperbaiki di sesi ini adalah **konsistensi & duplikasi**,
bukan perilakunya.

**Perbaikan:**
- Tambah helper bersama `classifyDayScans(scanTimes, shiftStart, shiftEnd)` di
  `lateCalculator.js` → satu sumber kebenaran untuk klasifikasi masuk/pulang. Helper ini
  meng-copy & menyortir input secara defensif, jadi pemanggil tak perlu pra-sortir.
- `deviceController.syncAttendance` dan `cronJobs.js` kini memanggil helper yang sama
  (sebelumnya masing-masing punya blok inline ~40 baris yang identik secara logika).
- `commitAttendance` **tidak** memakai helper ini karena ia menyimpan checkIn/checkOut hasil
  preview (sudah diklasifikasi saat sync awal), bukan mengklasifikasi ulang.
- Perilaku diverifikasi identik lewat skenario: scan pagi/sore, tepat midpoint, dua-scan,
  double-tap (<threshold), input tak terurut, night shift (scan malam & scan pagi), dan input
  kosong.

**File:** `backend/src/utils/lateCalculator.js`, `backend/src/controllers/deviceController.js`,
`backend/src/utils/cronJobs.js`

---

### 🟡 #6 — Perbaikan minor
- Penyeragaman string status fallback `'Mangkir'` → `'MANGKIR'` di `syncAttendance` &
  `commitAttendance` (sebelumnya campur kapital; tidak berdampak fungsional karena selalu
  ditimpa `resolveStatus`, tapi kini konsisten dengan cron).

**File:** `backend/src/controllers/deviceController.js`

---

## Verifikasi

- ✅ Syntax check lolos untuk seluruh file yang diubah:
  ```
  node --check src/utils/dateHelper.js
  node --check src/utils/lateCalculator.js
  node --check src/utils/cronJobs.js
  node --check src/controllers/deviceController.js
  ```
- ⏳ **Belum** diuji end-to-end terhadap mesin fingerprint fisik / data produksi. Disarankan:
  1. Jalankan **preview sync** pada satu mesin, bandingkan `lateMinutes` & `status` dengan
     ekspektasi (termasuk skenario terlambat dengan penalti aktif).
  2. Buat satu **koreksi manual HRD**, lalu jalankan sync manual + tunggu auto-sync → pastikan
     record manual **tidak** tertimpa.
  3. Uji satu hari yang melibatkan scan pagi (mis. 06:xx WIB) untuk memastikan tanggal absen
     benar (regression test temuan #1).

---

## Catatan & Risiko yang Masih Terbuka (belum diubah — sengaja)

- **#5 Single-scan ambiguitas (perilaku sengaja dipertahankan):** Penentuan masuk/pulang untuk
  1 scan memakai *midpoint* shift. Konsekuensi inheren yang **masih ada secara sengaja**
  (keputusan HRD: pertahankan perilaku, jangan ubah tanpa keputusan bisnis lebih lanjut):
  - Karyawan datang **setelah** tengah shift (mis. half-day / telat parah) → di-anggap pulang →
    `checkIn=null` → status MANGKIR walau hadir.
  - Karyawan hanya tap pulang (lupa tap masuk) di pagi hari → di-anggap masuk.
  Data mesin **tidak menyediakan flag in/out** (`getAttendances` hanya beri waktu + `verifyMode`),
  jadi klasifikasi memang harus menebak. Yang **sudah** dikerjakan: logika ini disatukan ke
  helper `classifyDayScans` sehingga semua jalur identik dan tidak bisa drift lagi. Yang
  **belum** (butuh keputusan bisnis): mengubah kebijakan MANGKIR atau aturan per-shift.

- **Kalibrasi jam mesin (`zk.setTime(new Date())` di `zkHelper.getAttendancesWithRetry`):**
  Masih menyetel jam mesin ke waktu **server**. Aman selama server WIB (dijamin oleh
  `TZ=Asia/Jakarta` di Docker). Untuk instalasi **native Windows**, pastikan jam OS = WIB.

- **Log mesin menumpuk:** `getAttendances()` membaca seluruh log mesin tiap sync lalu difilter
  di memori (default 30 hari). Untuk jangka panjang pertimbangkan pembersihan terjadwal via
  `clearDeviceLogs` (sudah ada backup otomatis sebelum clear).

- **Konsistensi jalur sync:** Tiga jalur kini konsisten secara perilaku karena berbagi helper
  (`getJakartaDateKey`, `isManualCorrection`, dan kini `classifyDayScans`) serta parameter yang
  sama. Duplikasi klasifikasi masuk/pulang sudah dihapus (#5). Penyatuan penuh ketiga jalur
  menjadi satu fungsi sync tunggal masih bisa dipertimbangkan, tapi sengaja tidak dilakukan
  sekarang untuk menjaga risiko tetap kecil.

---

## Riwayat

| Tanggal | Perubahan |
|---------|-----------|
| 2026-06-23 | Perbaikan awal temuan #1, #2, #3, #4, #6. Dokumentasi dibuat. |
| 2026-06-23 | #5 diselesaikan: klasifikasi single-scan disatukan ke helper `classifyDayScans` (perilaku midpoint + MANGKIR dipertahankan, duplikasi dihapus). |
