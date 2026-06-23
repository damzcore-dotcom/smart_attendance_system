# Perbaikan Halaman Mode Karyawan (Employee Self-Service)

Dokumen ini mencatat hasil pemeriksaan dan perbaikan pada **halaman mode karyawan** (ESS):
beranda, absen (Scan), pengajuan cuti, koreksi, dan pendaftaran Face ID.

- **Tanggal review:** 23 Juni 2026
- **Cakupan file:**
  - `frontend/src/pages/employee/EmployeeHome.jsx`
  - `frontend/src/pages/employee/Scan.jsx`
  - `frontend/src/pages/employee/Leave.jsx`
  - `frontend/src/utils/offlineSync.js` (baru)
  - `frontend/src/services/api.js`
  - `backend/src/controllers/attendanceController.js`

---

## Status Perbaikan

| # | Temuan | Severity | Status |
|---|--------|----------|--------|
| 1 | Sinkronisasi absen offline **rusak** di halaman Home (baca tanpa dekripsi) | 🔴 Bug | ✅ Selesai |
| 2 | Check-out offline kehilangan waktu asli (pakai waktu sync) | 🟠 Akurasi data | ✅ Selesai |
| 3 | `checkInMutation`/`checkOutMutation` di Home = dead code | 🟡 Cleanup | ✅ Selesai |
| 4 | Tidak ada validasi `endDate >= startDate` saat ajukan cuti | 🟡 UX | ✅ Selesai |
| 5 | Teks "HQ Office • Connected" hardcoded | 🟡 Kosmetik | ✅ Selesai |

---

## Detail Perbaikan

### 🔴 #1 — Sinkronisasi absen offline rusak di Home
**Masalah:** Antrian absen offline (`localStorage['pending_sync']`) **selalu ditulis
terenkripsi** oleh `Scan.jsx` (`encryptData`). Tetapi `EmployeeHome.jsx` membacanya dengan
`JSON.parse(pendingText)` **tanpa dekripsi** → `JSON.parse` atas ciphertext melempar error →
ditangkap diam-diam → data offline **tidak pernah tersinkron dari halaman beranda** (halaman
default setelah login). Logika sync terduplikasi di 2 tempat dan menjadi tidak konsisten sejak
enkripsi ditambahkan di Scan.

**Perbaikan:** Util bersama `frontend/src/utils/offlineSync.js` sebagai satu sumber kebenaran:
- `getPendingRecords()` — baca + dekripsi (fallback plaintext untuk data legacy, fallback `[]`
  bila korup).
- `savePendingRecords()` — enkripsi + simpan (atau hapus bila kosong).
- `queuePendingRecord()` — tambah satu record ke antrian.
- `syncPendingAttendance()` — flush antrian ke server; record gagal disimpan ulang.

`EmployeeHome.jsx` dan `Scan.jsx` kini sama-sama memakai util ini, jadi tidak bisa drift lagi.

**File:** `frontend/src/utils/offlineSync.js` (baru), `EmployeeHome.jsx`, `Scan.jsx`

### 🟠 #2 — Check-out offline pakai waktu asli
**Masalah:** Record OUT offline menyimpan `timestamp`, tetapi `attendanceAPI.checkOut()` tidak
punya parameter timestamp dan backend `checkOut` selalu memakai `new Date()` (waktu server). Saat
antrian tersinkron belakangan, jam check-out = jam upload, bukan jam check-out sebenarnya.
(Check-in offline tidak kena karena timestamp memang dikirim.)

**Perbaikan:**
- `attendanceAPI.checkOut(employeeId, photoData, lat, lng, timestamp)` — tambah `timestamp`.
- Backend `checkOut`: pakai `timestamp` client bila ada **dan valid & tidak di masa depan**
  (else fallback waktu server). Konsisten dengan jalur check-in yang sudah memercayai timestamp
  client. Nilai ini dipakai juga untuk perhitungan lembur & deteksi shift malam.
- `offlineSync.syncPendingAttendance()` meneruskan `record.timestamp` saat checkout.

**File:** `frontend/src/services/api.js`, `backend/src/controllers/attendanceController.js`,
`frontend/src/utils/offlineSync.js`

### 🟡 #3 — Hapus dead code di Home
`checkInMutation` & `checkOutMutation` di `EmployeeHome.jsx` tidak pernah dipanggil (tombol
beranda menavigasi ke halaman `/scan`). Dihapus, beserta import `verifyRealLocation` dan
`useMutation` yang jadi tak terpakai.

**File:** `frontend/src/pages/employee/EmployeeHome.jsx`

### 🟡 #4 — Validasi tanggal cuti
`Leave.jsx` kini:
- Input **End Date** punya `min={startDate}` (tidak bisa pilih tanggal sebelum mulai).
- Mengubah **Start Date** akan mengosongkan End Date bila jadi tidak valid.
- Guard di `handleSubmit`: tolak bila `endDate < startDate` dengan toast.

**File:** `frontend/src/pages/employee/Leave.jsx`

### 🟡 #5 — Status koneksi nyata di Home
Teks hardcoded "HQ Office • Connected" diganti indikator **Online/Offline** yang reaktif
(`navigator.onLine` + listener `online`/`offline`) dan menampilkan nama shift karyawan.

**File:** `frontend/src/pages/employee/EmployeeHome.jsx`

---

## Verifikasi

- ✅ `node --check` lolos: `attendanceController.js`
- ✅ Tidak ada referensi orphan (`pending_sync`/`encryptData`/`verifyRealLocation`/mutation
  lama) tersisa di `EmployeeHome.jsx`; `Scan.jsx` hanya menyisakan `verifyRealLocation` yang
  memang masih dipakai (efek GPS).
- ✅ Build frontend (Vite) sukses.
- ⏳ **Belum** diuji end-to-end secara manual. Disarankan:
  1. Aktifkan mode pesawat → absen check-in & check-out → pastikan tersimpan ("Absen disimpan di HP").
  2. Kembali online di **halaman beranda** → muncul toast "Berhasil sinkronisasi N rekam…".
  3. Cek jam check-out hasil sinkronisasi = jam saat offline (bukan jam upload).

---

## Catatan

- Halaman lain (Correction, FaceCheck) **fungsional**, tidak ada bug menghalangi.
- Banyak halaman karyawan mencampur teks Inggris (UI) + Indonesia (toast/konfirmasi) padahal
  proyek punya i18n — ini konsistensi luas yang belum digarap, **bukan** bug; tidak diubah di
  sesi ini agar fokus tetap pada perbaikan fungsional.

---

## Riwayat

| Tanggal | Perubahan |
|---------|-----------|
| 2026-06-23 | Review halaman mode karyawan. Perbaikan #1 (offline sync ke util bersama), #2 (timestamp check-out offline), #3 (dead code), #4 (validasi tanggal cuti), #5 (status koneksi). Dokumentasi dibuat. |
