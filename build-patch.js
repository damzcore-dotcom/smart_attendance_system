const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const rootDir = __dirname;
const patchDir = path.join(rootDir, 'PATCH_TEMP_NEW');
const patchZipPath = path.join(rootDir, 'Patch_Update.zip');

console.log('');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  📦  SMART ATTENDANCE PRO — PATCH BUILDER               ║');
console.log('║      Membuat file ZIP ringan untuk update ke client       ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

(async () => {
  try {
    // 1. BUILD FRONTEND & BACKEND
    console.log('── [1/4] Building Frontend ─────────────────────────────');
    execSync('npm run build', { cwd: path.join(rootDir, 'frontend'), stdio: 'inherit' });

    console.log('\n── [2/4] Building Backend (Obfuscation) ────────────────');
    execSync('npm run build', { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });

    // 2. PREPARE TEMP FOLDER
    console.log('\n── [3/4] Menyiapkan File Patch ─────────────────────────');
    if (fs.existsSync(patchDir)) fs.rmSync(patchDir, { recursive: true, force: true });
    fs.mkdirSync(patchDir);
    fs.mkdirSync(path.join(patchDir, 'backend'));
    fs.mkdirSync(path.join(patchDir, 'frontend'));

    // Copy only compiled files and schema (no node_modules, no raw src)
    fs.cpSync(path.join(rootDir, 'backend', 'dist'), path.join(patchDir, 'backend', 'dist'), { recursive: true });
    fs.cpSync(path.join(rootDir, 'backend', 'prisma'), path.join(patchDir, 'backend', 'prisma'), { recursive: true });
    fs.cpSync(path.join(rootDir, 'backend', 'package.json'), path.join(patchDir, 'backend', 'package.json'));
    
    fs.cpSync(path.join(rootDir, 'frontend', 'dist'), path.join(patchDir, 'frontend', 'dist'), { recursive: true });

    // Include AI Engine & Docker Compose for Face Recognition
    if (fs.existsSync(path.join(rootDir, 'ai_bridge'))) {
      fs.cpSync(path.join(rootDir, 'ai_bridge'), path.join(patchDir, 'ai_bridge'), { 
        recursive: true, 
        filter: (src) => !src.includes('__pycache__') && !src.includes('.git') && !src.includes('models') // Jangan bawa bobot model dalam patch
      });
    }
    if (fs.existsSync(path.join(rootDir, 'docker-compose.yml'))) {
      fs.cpSync(path.join(rootDir, 'docker-compose.yml'), path.join(patchDir, 'docker-compose.yml'));
    }

    // Create START_AI_ENGINE.bat in patch
    const aiBatContent = `@echo off
title Smart Attendance Pro - AI Engine Launcher
color 0E
echo ===================================================
echo    Smart Attendance Pro - AI Engine Launcher
echo ===================================================
echo.

docker -v >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Docker tidak terdeteksi!
  echo         Silakan instal Docker Desktop terlebih dahulu untuk menggunakan AI.
  echo         Unduh: https://www.docker.com/products/docker-desktop/
  echo.
  pause
  exit /b
)

echo [✓] Docker terdeteksi. Menyalakan AI Face Recognition Engine...
echo     (Redis, MinIO, dan AI Engine akan berjalan di latar belakang)
echo.

docker-compose up -d --build ai-engine redis minio

echo.
echo ===================================================
echo   AI Face Recognition Engine berhasil dinyalakan!
echo   - AI Service   : http://localhost:8001/health
echo   - MinIO Console: http://localhost:9001 (user: minioadmin / pass: minioadmin123)
echo ===================================================
echo.
pause
`;
    fs.writeFileSync(path.join(patchDir, 'START_AI_ENGINE.bat'), aiBatContent);

    // Create STOP_AI_ENGINE.bat in patch
    const aiStopBatContent = `@echo off
title Smart Attendance Pro - AI Engine Stopper
color 0C
echo ===================================================
echo    Smart Attendance Pro - AI Engine Stopper
echo ===================================================
echo.
echo Menghentikan semua kontainer AI Face Recognition...
echo.
docker-compose down
echo.
echo ===================================================
echo   AI Face Recognition Engine berhasil dimatikan.
echo ===================================================
echo.
pause
`;
    fs.writeFileSync(path.join(patchDir, 'STOP_AI_ENGINE.bat'), aiStopBatContent);

    // Create PANDUAN_AKTIVASI_AI_CCTV.txt in patch
    const aiGuideContent = `══════════════════════════════════════════════════════════════════════
  🏢 SMART ATTENDANCE PRO — PANDUAN AKTIVASI AI CCTV FACE RECOGNITION
══════════════════════════════════════════════════════════════════════

Fitur AI Face Recognition (pengenalan wajah melalui kamera CCTV) adalah
modul opsional yang membutuhkan spesifikasi hardware khusus dan Docker.

Langkah-langkah untuk mengaktifkannya di server klien:

1. PRASYARAT HARDWARE & SOFTWARE
   - Sistem Operasi: Windows 10/11 64-bit (Pro/Enterprise direkomendasikan).
   - RAM: Minimum 8 GB (16 GB direkomendasikan).
   - Processor: Intel Core i5/i7 Generasi 8 ke atas.
   - Perangkat Lunak: Wajib menginstal DOCKER DESKTOP.
     Unduh di: https://www.docker.com/products/docker-desktop/

2. MENYIAPKAN FILE MODEL (WEIGHTS)
   - Modul AI membutuhkan file bobot model pengenal wajah agar dapat mendeteksi wajah.
   - Masukkan file weights model Anda ke dalam folder:
     [direktori_aplikasi]/ai_bridge/models/
   - Pastikan model-model pendeteksi wajah (seperti FaceNet/Dlib weights) telah diletakkan di sana sebelum memulai service.

3. MENYALAKAN SERVICE AI
   - Pastikan aplikasi Docker Desktop sudah terbuka dan berjalan (indikator berwarna hijau).
   - Double-klik berkas "START_AI_ENGINE.bat" di folder utama aplikasi.
   - Program akan mengunduh dan membangun kontainer Docker (ai-engine, redis, dan minio).
   - Proses pertama kali membutuhkan koneksi internet untuk mengunduh base image Docker.

4. MENGHUBUNGKAN DENGAN APLIKASI UTAMA
   - Buka browser dan login ke web Smart Attendance Pro (http://localhost:5173).
   - Masuk ke menu Settings -> CCTV & Cameras.
   - Tambahkan IP kamera CCTV dan tentukan arah deteksi (Masuk/Keluar).
   - Indikator "AI Engine" di header dashboard Command Center akan otomatis berubah menjadi "Online".

══════════════════════════════════════════════════════════════════════
© 2026 Adam Rizky — Smart Attendance Pro
`;
    fs.writeFileSync(path.join(patchDir, 'PANDUAN_AKTIVASI_AI_CCTV.txt'), aiGuideContent);

    if (fs.existsSync(path.join(rootDir, 'reset-client-data.js'))) {
      fs.cpSync(path.join(rootDir, 'reset-client-data.js'), path.join(patchDir, 'reset-client-data.js'));
    }

    // 3. ZIP THE PATCH
    console.log('\n── [4/4] Membuat File ZIP (Patch_Update.zip) ───────────');
    const output = fs.createWriteStream(patchZipPath);
    const archive = new archiver.ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => {
      // CLEANUP TEMP FOLDER
      if (fs.existsSync(patchDir)) fs.rmSync(patchDir, { recursive: true, force: true });
      
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`\n✅ Patch Berhasil Dibuat!`);
      console.log(`   File : Patch_Update.zip`);
      console.log(`   Size : ${sizeMB} MB`);
      console.log(`\n💡 CARA UPDATE KE CLIENT:`);
      console.log(`   1. Kirim file Patch_Update.zip ke komputer client.`);
      console.log(`   2. Matikan aplikasi di komputer client.`);
      console.log(`   3. Ekstrak ZIP tersebut, dan copy-paste menimpa folder instalasi lama.`);
      console.log(`   4. Jalankan aplikasi seperti biasa. Update selesai!\n`);
    });

    archive.on('error', (err) => { throw err; });
    archive.pipe(output);
    archive.directory(patchDir, false);
    archive.finalize();

  } catch (err) {
    console.error('\n❌ BUILD PATCH GAGAL:', err.message);
    if (fs.existsSync(patchDir)) fs.rmSync(patchDir, { recursive: true, force: true });
  }
})();
