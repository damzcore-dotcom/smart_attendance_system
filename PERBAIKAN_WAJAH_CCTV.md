# Perbaikan Modul Wajah CCTV (Pendaftaran, Penangkapan Absen & Deteksi)

Dokumen ini mencatat hasil analisa mendalam dan perbaikan pada **jalur pendaftaran wajah CCTV
(InsightFace)** di semua lini (frontend → backend → AI Engine), serta pemeriksaan **proses
penangkapan wajah untuk absen**, **deteksi**, dan **overlay nama di layar CCTV**.

- **Tanggal review:** 23 Juni 2026
- **Cakupan file inti:**
  - Frontend: `frontend/src/components/admin/CCTVEnrollmentTab.jsx`,
    `frontend/src/pages/admin/FaceEnrollment.jsx`, `frontend/src/pages/admin/LiveCameraMonitor.jsx`,
    `frontend/src/components/admin/SettingsCameras.jsx`, `frontend/src/pages/admin/AdminDashboard.jsx`,
    `frontend/src/utils/aiEngine.js` (baru)
  - Backend: `backend/src/controllers/employeeController.js`,
    `backend/src/controllers/bridgeController.js`, `backend/src/routes/bridgeRoutes.js`,
    `backend/src/utils/aiEngine.js` (baru)
  - AI Engine: `ai_bridge/main.py`, `ai_bridge/ai/embedding_cache.py`,
    `ai_bridge/ai/face_recognizer.py`, `ai_bridge/attendance/recorder.py`,
    `ai_bridge/camera/stream_manager.py`, `ai_bridge/bridge/client.py`

---

## Ringkasan Arsitektur (konteks)

### A. Jalur pendaftaran wajah CCTV (yang benar-benar dipakai)

```
[Frontend] CCTVEnrollmentTab / FaceEnrollment (webcam lokal admin, 5 pose)
   │  per pose → POST <AI>/enroll?employee_id=<dbId>
   │     AI: detect → quality gate → (liveness) → embedding 512-dim → kembalikan
   ▼
[Frontend] PUT /employees/:id  { faceEmbeddingV2:[5 emb], faceSamples:5, faceStatus:'ENROLLED' }
   ▼
[Backend] employeeController.update → simpan Json → trigger AI /cache/reload
   ▼
[AI] /cache/reload → reload_from_db → GET /api/bridge/embeddings → cache.set → rebuild_matrix
   ▼
[AI] camera_worker → cocokkan wajah live vs matrix (threshold adaptif by jumlah sampel)
```

> Catatan: endpoint bridge `POST /enrollment/save` + `client.save_enrollment` adalah jalur
> alternatif yang **tidak dipakai** UI. `save_enrollment` (dead code) sudah dihapus; endpoint
> `postEnrollmentSave` tetap ada tetapi kini konsisten dengan jalur utama.

### B. Jalur penangkapan absen dari CCTV

```
[AI] stream_manager._capture_loop  (per kamera, thread)
   │   baca frame → motion gate (absdiff) → push frame ke queue (tiap FRAME_SKIP)
   ▼
[AI] camera_worker  → crop ROI → face detect → quality gate → (liveness) → embedding
   │   → match vs matrix → recorder.record(employee_id, cam, snapshot, similarity)
   │   → set active_detections[bbox,name,color] (untuk overlay)
   ▼
[AI] recorder.record → cooldown → upload snapshot MinIO → POST /api/bridge/checkin
   ▼
[Backend] postCheckin → tentukan window IN/OUT (shift-aware) + arah kamera → tulis checkIn/checkOut
```

---

## Status Perbaikan — Pendaftaran (Enrollment)

| # | Temuan | Severity | Status |
|---|--------|----------|--------|
| 1 | Default port AI engine untuk cache-reload tidak konsisten (8001 vs 8002) | 🟠 Tinggi | ✅ Selesai |
| 2 | `faceEnrolledAt` tidak ter-set di jalur nyata (PUT /employees) | 🟠 Tinggi | ✅ Selesai |
| 3 | Liveness **selalu** dipaksa saat enroll, tapi opsional saat recognize | 🟠 Tinggi | ✅ Selesai |
| 4 | Mixed-content saat panel via HTTPS (sistemik untuk semua endpoint AI) | 🟠 Tinggi | ✅ Disentralisasi + panduan |
| 5 | `null` embedding (jalur slot) bisa merusak `rebuild_matrix` | 🟡 Sedang | ✅ Selesai |
| 6 | `/enroll` tanpa auth + CORS `*` | 🟡 Rendah | 📌 Mitigasi via jaringan (lihat Catatan) |
| 7 | Label UI menyesatkan ("rata-rata 5 embedding") | 🟡 Kosmetik | ✅ Selesai |
| 8 | `reload_from_db` O(N²) + dead code (`save_enrollment`) | 🟡 Rendah | ✅ Selesai |

---

## Detail Perbaikan — Pendaftaran

### 🟠 #1 — Seragamkan target cache-reload AI engine
**Masalah:** `employeeController.update` default `http://sa_ai_engine:8001` (benar utk jaringan
internal Docker), tetapi `bridgeController.postEnrollmentSave` default `http://127.0.0.1:8002`
(itu port **host**, tidak ada di jaringan internal container). Bila `AI_ENGINE_URL` tidak diset,
kedua jalur menunjuk target berbeda.

**Perbaikan:** Helper bersama `backend/src/utils/aiEngine.js` (`getAiEngineUrl()` +
`reloadFaceCache()`), default tunggal `http://sa_ai_engine:8001` (override via `AI_ENGINE_URL`).
Kedua controller kini memakai `reloadFaceCache()`.

**File:** `backend/src/utils/aiEngine.js` (baru), `backend/src/controllers/employeeController.js`,
`backend/src/controllers/bridgeController.js`

### 🟠 #2 — `faceEnrolledAt` kini ter-stempel di jalur UI
**Masalah:** Hanya `postEnrollmentSave` (tidak dipakai UI) yang mengeset `faceEnrolledAt`; jalur
nyata `PUT /employees/:id` tidak, sehingga enrollment CCTV via UI selalu `faceEnrolledAt = null`.

**Perbaikan:** `employeeController.update` kini mengeset `faceEnrolledAt = new Date()` dan
`faceStatus = 'ENROLLED'` setiap kali `faceEmbeddingV2` dikirim.

**File:** `backend/src/controllers/employeeController.js`

### 🟠 #3 — Liveness saat enroll mengikuti `LIVENESS_ENABLED`
**Masalah:** `/enroll` selalu menolak bila liveness gagal, **tanpa** melihat `LIVENESS_ENABLED`,
sementara recognition hanya cek liveness saat `LIVENESS_ENABLED=true`. Pada deployment yang
sengaja mematikan liveness, enrollment tetap bisa gagal — membingungkan.

**Perbaikan:** `/enroll` kini hanya mengecek liveness bila `LIVENESS_ENABLED=true`, konsisten
dengan jalur recognition. Default Docker `LIVENESS_ENABLED=true`, jadi perilaku default tidak
melemah.

**File:** `ai_bridge/main.py`

### 🟠 #4 — Mixed-content (HTTPS): disentralisasi + panduan
**Masalah:** Logika URL AI engine (`<protocol>//<host>:8002`) **diduplikasi di 5 file** dan
dipakai untuk `/enroll`, `/stream`, `/health`, `/metrics`. Jika panel diakses via HTTPS, request
HTTP polos ke `:8002` diblokir browser (mixed content). Ini **sistemik**, bukan khusus enroll.

**Perbaikan:** Helper tunggal `frontend/src/utils/aiEngine.js` (`getAiEngineUrl()`) dipakai semua
call site. Satu titik konfigurasi: set `VITE_AI_ENGINE_URL` ke endpoint HTTPS. Helper juga
menampilkan `console.warn` jelas saat panel HTTPS namun `VITE_AI_ENGINE_URL` belum diset.
> Catatan: ini bukan masalah kode tunggal yang bisa "ditambal" — penyelesaian penuh memerlukan
> AI engine dilayani di belakang TLS / reverse proxy yang sama (lihat Catatan).

**File:** `frontend/src/utils/aiEngine.js` (baru), `CCTVEnrollmentTab.jsx`, `FaceEnrollment.jsx`,
`LiveCameraMonitor.jsx`, `SettingsCameras.jsx`, `AdminDashboard.jsx`

### 🟡 #5 — `null`/embedding cacat tidak lagi merusak matrix
**Masalah:** Jalur slot di `postEnrollmentSave` bisa menyimpan `null` (pad ke 5). Saat dimuat,
`rebuild_matrix` melakukan `np.array(null)` → baris rusak / `np.stack` bisa error.

**Perbaikan:** `EmbeddingCache.set()` membuang entri null/empty sebelum simpan; `rebuild_matrix`
melewati entri non-list/empty. Satu slot cacat tidak bisa lagi merusak seluruh matrix.

**File:** `ai_bridge/ai/embedding_cache.py`

### 🟡 #7 — Label UI
"Menyimpan rata-rata 5 embedding…" → "Menyimpan 5 sampel embedding wajah…" (faktanya 5 sampel
terpisah, bukan dirata-rata).

**File:** `frontend/src/components/admin/CCTVEnrollmentTab.jsx`

### 🟡 #8 — Efisiensi reload + dead code
**Masalah:** `reload_from_db` memanggil `rebuild_matrix()` tiap karyawan (O(N²)) lalu sekali lagi
di akhir. `client.save_enrollment` tidak pernah dipanggil.

**Perbaikan:** `set(..., rebuild=False)` saat bulk-load, rebuild **sekali** di akhir.
`save_enrollment` dihapus.

**File:** `ai_bridge/ai/embedding_cache.py`, `ai_bridge/bridge/client.py`

---

## Pemeriksaan — Penangkapan Absen, Deteksi & Overlay Nama

### ✅ Overlay nama karyawan di layar CCTV — SUDAH BERFUNGSI
`camera_worker` mengisi `active_detections` (bbox + nama + warna) untuk setiap wajah:
- Dikenali → **nama karyawan** (warna hijau)
- Tidak dikenal → "Unknown" (kuning)
- Spoof → "SPOOF DETECTED" (merah)

`stream_manager._capture_loop` menggambar kotak + `cv2.putText(name)` ke frame MJPEG yang
disajikan di `/cameras/:id/stream`. Jadi nama **memang tampil** di live view.

**Perilaku yang perlu diketahui (bukan bug):**
- Overlay hanya digambar saat **ada penonton** (`viewers > 0`) — hemat CPU. Recognition & absen
  tetap jalan walau tidak ada yang menonton.
- Kotak deteksi kedaluwarsa setelah **0.6 detik** (`now - timestamp < 0.6`); pada gerakan cepat,
  kotak bisa sedikit tertinggal posisi wajah karena digambar di frame yang lebih baru.

### ✅ Penangkapan absen — BERFUNGSI, dengan catatan
`bridgeController.postCheckin` sudah benar dan **shift-aware**:
- Menentukan window IN (start−2j … start+4j) & OUT (end−1j … end+6j) dari shift aktif/override,
  fallback ke window kamera (`captureInStart/End`, `captureOutStart/End`).
- Menghormati **arah kamera** (`direction` IN/OUT/BOTH).
- Menangani: buat checkIn baru, "checkin recovery", dan checkOut; di luar window → diabaikan.
- `lateMinutes` dihitung ulang di backend (tidak buta percaya AI).
- Cooldown anti-duplikat 300 dtk (`ATTENDANCE_COOLDOWN_SECONDS`).

**Catatan terbuka (belum diubah — perlu keputusan/observasi):**
- Cooldown bersifat **per-karyawan global**, bukan per arah. Bila karyawan tap masuk lalu pindah
  ke kamera OUT dalam <5 menit, scan kedua kena COOLDOWN. Untuk hari kerja normal tidak masalah.
- `recorder.record` memakai `datetime.now()` (waktu server). Aman karena `TZ=Asia/Jakarta`
  diset di service AI engine pada `docker-compose.yml`. Untuk instalasi native, pastikan jam OS = WIB.

### ⚠️ "Deteksi manusia" — saat ini berbasis WAJAH, bukan tubuh
Sistem mendeteksi **wajah** (InsightFace) dengan gerbang gerakan (motion) sebagai pra-filter
murah. **Tidak ada deteksi orang/tubuh penuh** (mis. YOLO person):
- Orang yang hadir tapi wajah tidak terlihat (membelakangi kamera / terlalu jauh / menunduk)
  tidak terdeteksi.
- Untuk absensi berbasis wajah ini memang cukup (butuh wajah jelas agar bisa dikenali).
- Jika diinginkan **penghitungan orang / deteksi kehadiran tanpa wajah**, itu fitur tambahan
  (model person-detection) — **belum ada** dan perlu keputusan terpisah.

---

## Verifikasi

- ✅ `node --check` lolos: `aiEngine.js`, `employeeController.js`, `bridgeController.js`
- ✅ `py -m py_compile` lolos: `main.py`, `embedding_cache.py`, `bridge/client.py`
- ✅ Tidak ada referensi `envUrl` orphan di frontend (semua via `getAiEngineUrl()`)
- ⏳ **Belum** diuji end-to-end terhadap kamera CCTV fisik / produksi. Disarankan:
  1. Daftarkan satu wajah via UI → cek `faceStatus=ENROLLED`, `faceSamples=5`, `faceEnrolledAt` terisi.
  2. Pantau log AI: `[Cache] In-memory matrix rebuilt: N embeddings`.
  3. Lewati kamera IN → muncul nama di live view + record checkIn; lewati kamera OUT → checkOut.
  4. (Bila HTTPS) set `VITE_AI_ENGINE_URL` ke endpoint HTTPS, pastikan stream & enroll jalan.

---

## Catatan & Risiko yang Masih Terbuka (sengaja)

- **#6 `/enroll` terbuka + CORS `*`:** AI engine memang diakses lewat IP LAN/publik dinamis tanpa
  cookie/sesi, sehingga CORS `*` dipertahankan. `/enroll` hanya **mengekstraksi** embedding
  (tidak menyimpan; penyimpanan tetap butuh JWT di `PUT /employees`). Mitigasi yang disarankan:
  jalankan AI engine di **jaringan privat** / di belakang reverse proxy berautentikasi, bukan
  diekspos langsung ke internet. Tidak diubah di kode agar tidak memutus pola akses langsung dari
  browser (stream MJPEG via `<img>` tidak bisa lewat proxy axios).
- **#4 HTTPS:** penyelesaian penuh = layani AI engine di belakang TLS yang sama dan set
  `VITE_AI_ENGINE_URL`. Kode sudah menyediakan titik konfigurasi tunggal + peringatan.
- **Konsistensi enroll vs commit:** `postEnrollmentSave` (jalur alternatif) tetap dipertahankan
  untuk kompatibilitas, namun kini berbagi `reloadFaceCache()` yang sama dengan jalur utama.

---

## Riwayat

| Tanggal | Perubahan |
|---------|-----------|
| 2026-06-23 | Review jalur wajah CCTV semua lini. Perbaikan #1,#2,#3,#5,#7,#8; #4 disentralisasi + panduan; #6 didokumentasikan. Pemeriksaan overlay nama (berfungsi), penangkapan absen (berfungsi), dan klarifikasi deteksi berbasis wajah. Dokumentasi dibuat. |
