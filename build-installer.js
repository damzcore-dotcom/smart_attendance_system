const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const releaseDir = path.join(rootDir, 'CLIENT_RELEASE');

console.log('===================================================');
console.log('🚀 SMART ATTENDANCE PRO - INSTALLER PACKAGER');
console.log('===================================================\n');

try {
  // 1. Clean previous release
  if (fs.existsSync(releaseDir)) {
    console.log('🧹 Cleaning previous release folder...');
    fs.rmSync(releaseDir, { recursive: true, force: true });
  }
  fs.mkdirSync(releaseDir);
  fs.mkdirSync(path.join(releaseDir, 'backend'));
  fs.mkdirSync(path.join(releaseDir, 'frontend'));

  // 2. Build Frontend
  console.log('⚙️  Building Frontend (React)...');
  execSync('npm run build', { cwd: path.join(rootDir, 'frontend'), stdio: 'inherit' });

  // 3. Build Backend (Obfuscation)
  console.log('\n⚙️  Building Backend (Obfuscation)...');
  execSync('npm run build', { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });

  // 4. Copying files to RELEASE folder
  console.log('\n📦 Packaging files for client...');
  
  // Backend files
  fs.cpSync(path.join(rootDir, 'backend', 'dist'), path.join(releaseDir, 'backend', 'dist'), { recursive: true });
  fs.cpSync(path.join(rootDir, 'backend', 'prisma'), path.join(releaseDir, 'backend', 'prisma'), { recursive: true });
  fs.copyFileSync(path.join(rootDir, 'backend', 'package.json'), path.join(releaseDir, 'backend', 'package.json'));
  
  // Frontend files
  fs.cpSync(path.join(rootDir, 'frontend', 'dist'), path.join(releaseDir, 'frontend', 'dist'), { recursive: true });
  
  // Create minimal package.json for frontend serving
  const frontendPackage = {
    name: "smart-attendance-client",
    version: "1.0.0",
    scripts: {
      "start": "npx serve -s dist -l 5173"
    }
  };
  fs.writeFileSync(path.join(releaseDir, 'frontend', 'package.json'), JSON.stringify(frontendPackage, null, 2));

  // 5. Copy Setup & Config Templates
  fs.copyFileSync(path.join(rootDir, 'setup-client.js'), path.join(releaseDir, 'setup-client.js'));
  fs.copyFileSync(path.join(rootDir, 'generate-license.js'), path.join(releaseDir, 'generate-license.js'));
  fs.copyFileSync(path.join(rootDir, 'PANDUAN_INSTALASI.txt'), path.join(releaseDir, 'PANDUAN_INSTALASI.txt'));
  fs.copyFileSync(path.join(rootDir, 'backend', '.env.example'), path.join(releaseDir, 'backend', '.env.example'));
  fs.copyFileSync(path.join(rootDir, 'app-launcher.js'), path.join(releaseDir, 'app-launcher.js'));
  fs.copyFileSync(path.join(rootDir, 'launcher-ui.html'), path.join(releaseDir, 'launcher-ui.html'));
  if (fs.existsSync(path.join(rootDir, 'frontend', '.env.example'))) {
    fs.copyFileSync(path.join(rootDir, 'frontend', '.env.example'), path.join(releaseDir, 'frontend', '.env.example'));
  }

  // Include AI Engine & Docker Compose for Face Recognition (excluding weights/git/cache)
  if (fs.existsSync(path.join(rootDir, 'ai_bridge'))) {
    console.log('📦 Packaging AI CCTV Engine files (excluding weights)...');
    fs.cpSync(path.join(rootDir, 'ai_bridge'), path.join(releaseDir, 'ai_bridge'), { 
      recursive: true, 
      filter: (src) => !src.includes('__pycache__') && !src.includes('.git') && !src.includes('models')
    });
    // Create empty models directory for layout structure
    fs.mkdirSync(path.join(releaseDir, 'ai_bridge', 'models'), { recursive: true });
  }
  if (fs.existsSync(path.join(rootDir, 'docker-compose.yml'))) {
    fs.copyFileSync(path.join(rootDir, 'docker-compose.yml'), path.join(releaseDir, 'docker-compose.yml'));
  }

  // 6. Create START.bat for Client
  const batContent = `@echo off
title Smart Attendance Pro
color 0A
echo ===================================================
echo    Smart Attendance Pro - Launcher
echo ===================================================
echo.

REM Check if .env exists
if not exist "backend\\.env" (
  echo [!] File backend\\.env belum ada!
  echo     Jalankan setup terlebih dahulu:
  echo     node setup-client.js
  echo.
  pause
  exit /b
)

cd backend
echo [1/4] Menginstall modul backend...
call npm install --production --quiet
echo [2/4] Menyiapkan database...
call npx prisma generate
call npx prisma db push

cd ../frontend
echo [3/4] Menginstall modul frontend...
call npm install serve --quiet

cd ..
echo [4/4] Memulai GUI Launcher...
start "Smart Attendance Launcher" /min cmd /c "node app-launcher.js"

echo.
echo ===================================================
echo   GUI Launcher berhasil dijalankan!
echo   Layanan absensi dapat dikontrol dari jendela Launcher.
echo ===================================================
timeout /t 5 >nul
`;
  fs.writeFileSync(path.join(releaseDir, 'START_APP.bat'), batContent);

  // Create START_AI_ENGINE.bat
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
  fs.writeFileSync(path.join(releaseDir, 'START_AI_ENGINE.bat'), aiBatContent);

  // Create PANDUAN_AKTIVASI_AI_CCTV.txt
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
  fs.writeFileSync(path.join(releaseDir, 'PANDUAN_AKTIVASI_AI_CCTV.txt'), aiGuideContent);

  console.log('\n✅ PROSES SELESAI!');
  console.log('===================================================');
  console.log('Folder "CLIENT_RELEASE" berhasil dibuat.');
  console.log('Langkah selanjutnya:');
  console.log('1. Buka folder smart_attendance_system');
  console.log('2. Cari folder bernama CLIENT_RELEASE');
  console.log('3. Klik kanan folder tersebut -> Send to -> Compressed (zipped) folder');
  console.log('4. File ZIP tersebutlah yang Anda berikan ke klien!');
  console.log('===================================================\n');

} catch (error) {
  console.error('\n❌ Terjadi kesalahan saat mem-build:', error.message);
}
