const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));
const rootDir = __dirname;
const MASTER_SECRET = 'd94795ad7e96949a882a1f45a4206a69184172efc14f226f4c49def1bf9bdfc1';

console.log('');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  🚀  SMART ATTENDANCE PRO — CLIENT PACKAGE BUILDER      ║');
console.log('║      Build + License + Konfigurasi dalam 1 langkah      ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

(async () => {
  try {
    // ─── INPUT DATA KLIEN ───
    console.log('── DATA PERUSAHAAN KLIEN ───────────────────────────────');
    const clientName = await ask('   Nama perusahaan     : ');
    if (!clientName.trim()) { console.error('❌ Nama wajib diisi!'); process.exit(1); }
    const maxEmployees = await ask('   Limit karyawan [100]: ') || '100';
    const licenseExpiry = await ask('   Masa aktif sampai [2027-12-31]: ') || '2027-12-31';

    console.log('');
    console.log(`   ✅ ${clientName} | ${maxEmployees} karyawan | exp: ${licenseExpiry}`);
    console.log('');

    const safeClientName = clientName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    const releaseDir = path.join(rootDir, `RELEASE_${safeClientName}`);

    // ─── STEP 1: BUILD ───
    console.log('── [1/5] Building Frontend ─────────────────────────────');
    execSync('npm run build', { cwd: path.join(rootDir, 'frontend'), stdio: 'inherit' });

    console.log('\n── [2/5] Building Backend (Obfuscation) ────────────────');
    execSync('npm run build', { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });

    // ─── STEP 2: PACKAGE FILES ───
    console.log('\n── [3/5] Packaging Files ───────────────────────────────');
    if (fs.existsSync(releaseDir)) fs.rmSync(releaseDir, { recursive: true, force: true });
    fs.mkdirSync(releaseDir);
    fs.mkdirSync(path.join(releaseDir, 'backend'));
    fs.mkdirSync(path.join(releaseDir, 'frontend'));

    // Backend
    fs.cpSync(path.join(rootDir, 'backend', 'dist'), path.join(releaseDir, 'backend', 'dist'), { recursive: true });
    fs.cpSync(path.join(rootDir, 'backend', 'prisma'), path.join(releaseDir, 'backend', 'prisma'), { recursive: true });
    fs.copyFileSync(path.join(rootDir, 'backend', 'package.json'), path.join(releaseDir, 'backend', 'package.json'));
    if (fs.existsSync(path.join(rootDir, 'backend', '.env.example')))
      fs.copyFileSync(path.join(rootDir, 'backend', '.env.example'), path.join(releaseDir, 'backend', '.env.example'));

    // Frontend
    fs.cpSync(path.join(rootDir, 'frontend', 'dist'), path.join(releaseDir, 'frontend', 'dist'), { recursive: true });
    const fpkg = { name: "smart-attendance-client", version: "1.0.0", scripts: { start: "npx serve -s dist -l 5173" } };
    fs.writeFileSync(path.join(releaseDir, 'frontend', 'package.json'), JSON.stringify(fpkg, null, 2));
    if (fs.existsSync(path.join(rootDir, 'frontend', '.env.example')))
      fs.copyFileSync(path.join(rootDir, 'frontend', '.env.example'), path.join(releaseDir, 'frontend', '.env.example'));

    // Tools & docs
    fs.copyFileSync(path.join(rootDir, 'setup-client.js'), path.join(releaseDir, 'setup-client.js'));
    if (fs.existsSync(path.join(rootDir, 'PANDUAN_INSTALASI.txt')))
      fs.copyFileSync(path.join(rootDir, 'PANDUAN_INSTALASI.txt'), path.join(releaseDir, 'PANDUAN_INSTALASI.txt'));

    // Copy PDF jika ada
    const pdfFiles = fs.readdirSync(rootDir).filter(f => f.toLowerCase().includes('panduan') && f.endsWith('.pdf'));
    pdfFiles.forEach(f => {
      fs.copyFileSync(path.join(rootDir, f), path.join(releaseDir, f));
      console.log(`   📄 PDF ditemukan: ${f} → disertakan!`);
    });

    // Also check CLIENT_RELEASE for HTML panduan
    const htmlPanduan = path.join(rootDir, 'CLIENT_RELEASE', 'PANDUAN_INSTALASI.html');
    if (fs.existsSync(htmlPanduan))
      fs.copyFileSync(htmlPanduan, path.join(releaseDir, 'PANDUAN_INSTALASI.html'));

    // Include AI Engine & Docker Compose for Face Recognition (excluding weights/git/cache)
    if (fs.existsSync(path.join(rootDir, 'ai_bridge'))) {
      console.log('   📦 Copying AI CCTV Engine files (excluding weights)...');
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

    console.log('   ✅ Semua file berhasil dikemas');

    // ─── STEP 3: GENERATE LICENSE ───
    console.log('\n── [4/5] Generating License Key ────────────────────────');
    const payload = { client: clientName, expiry: licenseExpiry, limit: parseInt(maxEmployees) };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const hmac = crypto.createHmac('sha256', MASTER_SECRET);
    hmac.update(payloadB64);
    const signature = hmac.digest('hex');
    const licenseKey = `${payloadB64}.${signature}`;

    const licenseContent = [
      `═══════════════════════════════════════════════════`,
      `SMART ATTENDANCE PRO — LICENSE KEY`,
      `═══════════════════════════════════════════════════`,
      `Client        : ${clientName}`,
      `Max Employees : ${maxEmployees}`,
      `Expiry Date   : ${licenseExpiry}`,
      `Generated     : ${new Date().toLocaleString('id-ID')}`,
      `═══════════════════════════════════════════════════`, ``,
      `LICENSE KEY:`, licenseKey, ``,
      `═══════════════════════════════════════════════════`,
      `Masukkan key di atas ke menu Settings → License`,
      `pada aplikasi Smart Attendance Pro.`,
      `═══════════════════════════════════════════════════`,
      ``, `© 2026 Adam Rizky`
    ].join('\n');

    const licenseFileName = `LICENSE_KEY_${safeClientName}.txt`;
    fs.writeFileSync(path.join(releaseDir, licenseFileName), licenseContent);
    console.log(`   🔑 ${licenseFileName} berhasil dibuat`);

    // Inject initial license key into release backend/.env.example
    const releaseEnvExamplePath = path.join(releaseDir, 'backend', '.env.example');
    if (fs.existsSync(releaseEnvExamplePath)) {
      let content = fs.readFileSync(releaseEnvExamplePath, 'utf8');
      content = content.replace(/INITIAL_LICENSE_KEY="[^"]*"/, `INITIAL_LICENSE_KEY="${licenseKey}"`);
      fs.writeFileSync(releaseEnvExamplePath, content);
      console.log(`   📝 INITIAL_LICENSE_KEY berhasil disuntikkan ke .env.example klien`);
    }

    // ─── STEP 4: CREATE LAUNCHERS & GUIDES ───
    console.log('\n── [5/5] Creating Launchers & Guides ───────────────────');
    const bat = `@echo off
title Smart Attendance Pro - ${clientName}
color 0A
echo ===================================================
echo    Smart Attendance Pro - ${clientName}
echo ===================================================
echo.

if not exist "backend\\.env" (
  echo [!] Konfigurasi belum dibuat!
  echo     Jalankan dulu: node setup-client.js
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
call node prisma/seed.js

cd ../frontend
echo [3/4] Menginstall modul frontend...
call npm install serve --quiet

cd ..
echo [4/4] Memulai sistem...
start "Backend - ${clientName}" cmd /k "cd backend && npm run start:prod"
start "Frontend - ${clientName}" cmd /k "cd frontend && npm start"

echo.
echo ===================================================
echo   Sistem ${clientName} berhasil dijalankan!
echo   Buka browser: http://localhost:5173
echo ===================================================
pause
`;
    fs.writeFileSync(path.join(releaseDir, 'START_APP.bat'), bat);
    console.log('   ✅ START_APP.bat dibuat');

    // Create START_AI_ENGINE.bat
    const aiBat = `@echo off
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
    fs.writeFileSync(path.join(releaseDir, 'START_AI_ENGINE.bat'), aiBat);
    console.log('   ✅ START_AI_ENGINE.bat dibuat');

    // Create STOP_AI_ENGINE.bat
    const aiStopBat = `@echo off
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
    fs.writeFileSync(path.join(releaseDir, 'STOP_AI_ENGINE.bat'), aiStopBat);
    console.log('   ✅ STOP_AI_ENGINE.bat dibuat');

    // Create PANDUAN_AKTIVASI_AI_CCTV.txt
    const aiGuide = `══════════════════════════════════════════════════════════════════════
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
    fs.writeFileSync(path.join(releaseDir, 'PANDUAN_AKTIVASI_AI_CCTV.txt'), aiGuide);
    console.log('   ✅ PANDUAN_AKTIVASI_AI_CCTV.txt dibuat');

    // ─── DONE ───
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║           ✅  PAKET KLIEN BERHASIL DIBUAT!               ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  Client    : ${clientName.padEnd(43)}║`);
    console.log(`║  Limit     : ${(maxEmployees + ' karyawan').padEnd(43)}║`);
    console.log(`║  Expired   : ${licenseExpiry.padEnd(43)}║`);
    console.log(`║  Folder    : RELEASE_${safeClientName}`.padEnd(58) + '║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  Isi paket:                                              ║');
    console.log('║  📁 backend/        (server API ter-obfuscate)           ║');
    console.log('║  📁 frontend/       (web app production)                 ║');
    console.log('║  📁 ai_bridge/      (AI Engine files - no weights)       ║');
    console.log('║  📄 setup-client.js (wizard konfigurasi)                 ║');
    console.log('║  📄 START_APP.bat   (launcher otomatis)                  ║');
    console.log('║  📄 START_AI_ENGINE.bat (CCTV AI launcher)               ║');
    console.log('║  📄 PANDUAN_AKTIVASI_AI_CCTV.txt                         ║');
    console.log(`║  🔑 ${licenseFileName.padEnd(42)}║`);
    console.log('║  📖 PANDUAN_INSTALASI (PDF/HTML/TXT)                     ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  LANGKAH SELANJUTNYA:                                    ║');
    console.log(`║  1. Buka folder RELEASE_${safeClientName}`.padEnd(58) + '║');
    console.log('║  2. Select All → Klik kanan → Send to → Compressed ZIP  ║');
    console.log('║  3. Kirim file ZIP tersebut ke klien                    ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    rl.close();
  }
})();
