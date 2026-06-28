const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const rootDir = __dirname;
const releaseDir = path.join(rootDir, 'RELEASE_DEMO');
const MASTER_SECRET = 'd94795ad7e96949a882a1f45a4206a69184172efc14f226f4c49def1bf9bdfc1';

console.log('');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  🚀  SMART ATTENDANCE PRO — DEMO PACKAGE BUILDER        ║');
console.log('║      Automated Demo Package Packager & Installer         ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

(async () => {
  try {
    const clientName = 'PT. Demo Sejahtera';
    const maxEmployees = '50';
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    const licenseExpiry = expiryDate.toISOString().split('T')[0];

    console.log(`   🔸 Target: ${clientName} | ${maxEmployees} Karyawan | Expiry: ${licenseExpiry}`);
    console.log('');

    // ─── STEP 1: BUILD FRONTEND ───
    console.log('── [1/6] Building Frontend ─────────────────────────────');
    execSync('npm run build', { cwd: path.join(rootDir, 'frontend'), stdio: 'inherit' });

    // ─── STEP 2: BUILD BACKEND ───
    console.log('\n── [2/6] Building Backend (Obfuscation) ────────────────');
    execSync('npm run build', { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });

    // ─── STEP 3: PACKAGE FILES ───
    console.log('\n── [3/6] Packaging Files to RELEASE_DEMO/ ──────────────');
    if (fs.existsSync(releaseDir)) fs.rmSync(releaseDir, { recursive: true, force: true });
    fs.mkdirSync(releaseDir);
    fs.mkdirSync(path.join(releaseDir, 'backend'));
    fs.mkdirSync(path.join(releaseDir, 'frontend'));

    // Copy Backend files
    fs.cpSync(path.join(rootDir, 'backend', 'dist'), path.join(releaseDir, 'backend', 'dist'), { recursive: true });
    fs.cpSync(path.join(rootDir, 'backend', 'prisma'), path.join(releaseDir, 'backend', 'prisma'), { recursive: true });
    fs.copyFileSync(path.join(rootDir, 'backend', 'package.json'), path.join(releaseDir, 'backend', 'package.json'));

    // Copy Frontend files
    fs.cpSync(path.join(rootDir, 'frontend', 'dist'), path.join(releaseDir, 'frontend', 'dist'), { recursive: true });
    const fpkg = { name: "smart-attendance-demo-frontend", version: "1.0.0", scripts: { start: "npx serve -s dist -l 5173" } };
    fs.writeFileSync(path.join(releaseDir, 'frontend', 'package.json'), JSON.stringify(fpkg, null, 2));

    // Copy PDF Guides if any
    const pdfFiles = fs.readdirSync(rootDir).filter(f => f.toLowerCase().includes('panduan') && f.endsWith('.pdf'));
    pdfFiles.forEach(f => {
      fs.copyFileSync(path.join(rootDir, f), path.join(releaseDir, f));
      console.log(`   📄 PDF Guide: ${f} included!`);
    });

    console.log('   ✅ All files packaged successfully.');

    // ─── STEP 4: GENERATE LICENSE ───
    console.log('\n── [4/6] Generating Demo License Key ───────────────────');
    const payload = { client: clientName, expiry: expiryDate.toISOString(), limit: parseInt(maxEmployees), features: ['all'] };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const hmac = crypto.createHmac('sha256', MASTER_SECRET);
    hmac.update(payloadB64);
    const signature = hmac.digest('hex');
    const licenseKey = `${payloadB64}.${signature}`;

    const licenseContent = [
      `═══════════════════════════════════════════════════`,
      `SMART ATTENDANCE PRO — DEMO LICENSE KEY`,
      `═══════════════════════════════════════════════════`,
      `Client        : ${clientName}`,
      `Max Employees : ${maxEmployees} Karyawan`,
      `Expiry Date   : ${licenseExpiry} (30 Hari Trial)`,
      `Generated     : ${new Date().toLocaleString('id-ID')}`,
      `═══════════════════════════════════════════════════`, ``,
      `LICENSE KEY:`, licenseKey, ``,
      `═══════════════════════════════════════════════════`,
      `License ini dikonfigurasi otomatis saat pertama kali`,
      `menjalankan START_DEMO.bat.`,
      `═══════════════════════════════════════════════════`,
      ``, `© 2026 Adam Rizky — Smart Attendance Pro`
    ].join('\n');

    fs.writeFileSync(path.join(releaseDir, 'LICENSE_DEMO.txt'), licenseContent);
    console.log(`   🔑 LICENSE_DEMO.txt created`);

    // ─── STEP 5: GENERATE PRE-CONFIGURED .ENV FILES ───
    console.log('\n── [5/6] Generating Pre-configured .env Files ──────────');
    const backendEnv = [
      `# Smart Attendance Pro — DEMO CONFIGURATION`,
      `# Database: smart_attendance_demo (TERPISAH dari database utama)`,
      ``,
      `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/smart_attendance_demo"`,
      `PORT=5000`,
      `CORS_ORIGINS="http://localhost:5173,http://localhost:5174"`,
      `JWT_SECRET="demo-jwt-secret-smartattendance-2026"`,
      `JWT_REFRESH_SECRET="demo-refresh-secret-smartattendance-2026"`,
      `INITIAL_LICENSE_KEY="${licenseKey}"`,
      `CHATBOT_MODE="local"`,
      `DEMO_MODE="true"`
    ].join('\n');

    fs.writeFileSync(path.join(releaseDir, 'backend', '.env'), backendEnv);
    console.log('   📝 Pre-configured backend .env generated');

    const frontendEnv = [
      `VITE_PORT=5173`,
      `VITE_API_URL=http://localhost:5000`,
      `VITE_DEMO_MODE=true`,
      `VITE_DEMO_CONTACT=082124130065`
    ].join('\n');

    fs.writeFileSync(path.join(releaseDir, 'frontend', '.env'), frontendEnv);
    console.log('   📝 Pre-configured frontend .env generated');

    // ─── STEP 6: CREATE START, RESET BAT & PANDUAN ───
    console.log('\n── [6/6] Creating Launchers & Guides ───────────────────');
    
    // START_DEMO.bat
    const startBat = `@echo off
chcp 65001 >nul
title Smart Attendance Pro - DEMO LAUNCHER
color 0E
echo.
echo  ╔═══════════════════════════════════════════════════╗
echo  ║   🔶  SMART ATTENDANCE PRO — DEMO MODE           ║
echo  ║   Sistem Presensi, HRIS, Face Recognition ^& Payroll ║
echo  ╚═══════════════════════════════════════════════════╝
echo.

:: Check Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js belum terinstall di komputer ini!
    echo          Download ^& Install Node.js dari: https://nodejs.org/
    echo          ^(Gunakan versi LTS direkomendasikan^)
    echo.
    pause
    exit /b
)

:: Ask PostgreSQL password only
echo  Sistem akan menggunakan database PostgreSQL local Anda.
set /p PGPASSWORD="  Masukkan password PostgreSQL Anda: "
echo.

:: Update .env with provided password
cd /d "%~dp0backend"
powershell -Command "(Get-Content .env) -replace 'postgres:postgres@', 'postgres:%PGPASSWORD%@' | Set-Content .env"

:: Auto create demo database
echo  [1/5] Menyiapkan database demo...
set PGPASSWORD=%PGPASSWORD%
:: Check if db exists
psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='smart_attendance_demo'" 2>nul | findstr "1" >nul
if %errorlevel% neq 0 (
    echo        Database tidak ditemukan. Membuat database baru...
    psql -U postgres -c "CREATE DATABASE smart_attendance_demo"
    if %errorlevel% neq 0 (
        echo  [ERROR] Gagal membuat database! Pastikan PostgreSQL menyala dan password benar.
        pause
        exit /b
      )
) else (
    echo        Database smart_attendance_demo terdeteksi.
)

:: Install & setup dependencies
echo  [2/5] Menginstall modul backend...
call npm install --production --quiet

echo  [3/5] Menyiapkan skema database...
call npx prisma generate
call npx prisma db push

echo  [4/5] Mengisi data simulasi (50 karyawan, 30 hari data absensi)...
node prisma/seed-demo.js

echo  [5/5] Memulai sistem...
cd /d "%~dp0"
start "Backend - Smart Attendance DEMO" cmd /k "cd backend && npm run start:prod"
timeout /t 3 /nobreak >nul
start "Frontend - Smart Attendance DEMO" cmd /k "cd frontend && npx serve -s dist -l 5173"

echo.
echo  ╔═══════════════════════════════════════════════════╗
echo  ║   ✅  DEMO BERHASIL DIJALANKAN!                   ║
echo  ╠═══════════════════════════════════════════════════╣
echo  ║   🌐 Buka Browser: http://localhost:5173          ║
echo  ║                                                   ║
echo  ║   👤 Akun Uji Coba (Login):                       ║
echo  ║   - Super Admin : admin / admin123                ║
echo  ║   - HR Admin    : hrd / hrd123                    ║
echo  ║   - Accounting  : acc / acc123                    ║
echo  ║   - Manager     : manager / mgr123                ║
echo  ║   - Karyawan    : karyawan / emp123               ║
echo  ║                                                   ║
echo  ║   📞 Hubungi: 082124130065 (WhatsApp)             ║
echo  ╚═══════════════════════════════════════════════════╝
echo.
pause
`;
    fs.writeFileSync(path.join(releaseDir, 'START_DEMO.bat'), startBat);
    console.log('   ✅ START_DEMO.bat created');

    // RESET_DEMO.bat
    const resetBat = `@echo off
chcp 65001 >nul
title Smart Attendance Pro - RESET DEMO
color 0C
echo.
echo  ⚠️ RESET DATABASE DEMO
echo  Tindakan ini akan menghapus database 'smart_attendance_demo'
echo  dan mengisinya kembali dengan data simulasi awal.
echo.
set /p confirm="  Lanjutkan proses reset? (y/n): "
if /i not "%confirm%"=="y" (
    echo  Dibatalkan.
    pause
    exit /b
)
echo.

set /p PGPASSWORD="  Masukkan password PostgreSQL Anda: "
set PGPASSWORD=%PGPASSWORD%
echo.

echo  🔄 Menghentikan database lama...
psql -U postgres -c "DROP DATABASE IF EXISTS smart_attendance_demo"
if %errorlevel% neq 0 (
    echo  [ERROR] Gagal menghapus database. Pastikan tidak ada aplikasi yang sedang terhubung ke database.
    pause
    exit /b
)

echo  🔄 Membuat ulang database...
psql -U postgres -c "CREATE DATABASE smart_attendance_demo"

cd /d "%~dp0backend"
echo  🔄 Sinkronisasi skema...
call npx prisma generate
call npx prisma db push
echo  🔄 Memuat data simulasi baru...
node prisma/seed-demo.js

echo.
echo  ✅ Demo berhasil di-reset ke kondisi awal!
echo  Jalankan START_DEMO.bat untuk memulai aplikasi kembali.
pause
`;
    fs.writeFileSync(path.join(releaseDir, 'RESET_DEMO.bat'), resetBat);
    console.log('   ✅ RESET_DEMO.bat created');

    // PANDUAN_DEMO.txt
    const panduanDemo = `======================================================================
     🔶 SMART ATTENDANCE PRO — PANDUAN APLIKASI VERSI DEMO / TRIAL
======================================================================

Selamat mencoba aplikasi Smart Attendance Pro! 
Versi demo ini dilengkapi dengan 50 data karyawan simulasi, data absensi 
selama 30 hari terakhir, pengaturan shift, cuti, serta rekapitulasi penggajian.

----------------------------------------------------------------------
1. CARA MENJALANKAN APLIKASI
----------------------------------------------------------------------
- Pastikan komputer Anda telah terinstall Node.js (versi 18+) dan PostgreSQL.
- Jalankan file "START_DEMO.bat" (Klik dua kali).
- Masukkan password PostgreSQL local Anda saat diminta.
- Program akan otomatis menyiapkan database "smart_attendance_demo",
  menginstal dependency, melakukan migrasi skema, memuat data awal,
  serta membuka server backend (port 5000) dan frontend (port 5173).
- Buka browser Anda dan akses ke alamat:
  🌐 http://localhost:5173

----------------------------------------------------------------------
2. AKUN LOGIN DEMO
----------------------------------------------------------------------
Anda dapat masuk menggunakan salah satu dari 5 akun dengan hak akses berbeda:

a. Role: SUPER ADMIN (Akses Penuh ^& Manajemen Lisensi)
   - Username : admin
   - Password : admin123

b. Role: HR ADMIN (Manajemen Karyawan, Shift, Libur ^& Cuti)
   - Username : hrd
   - Password : hrd123

c. Role: ACCOUNTING (Manajemen Komponen Gaji, Lembur ^& Payroll)
   - Username : acc
   - Password : acc123

d. Role: MANAGER (Persetujuan Cuti ^& Koreksi Absen Staff)
   - Username : manager
   - Password : mgr123

e. Role: EMPLOYEE (Pengajuan Cuti, Koreksi Absen, Absen Web Cam)
   - Username : karyawan
   - Password : emp123

----------------------------------------------------------------------
3. BATASAN VERSI DEMO (DEMO MODE RESTRICTIONS)
----------------------------------------------------------------------
Untuk melindungi penyebaran versi tidak resmi:
- Fitur Backup ^& Restore dinonaktifkan (di-block).
- Setiap halaman web menampilkan Watermark "DEMO".
- Setiap hasil ekspor laporan Excel menyertakan watermark baris atas 
  dan tab khusus "DEMO_NOTICE".
- Masa aktif demo ini adalah 30 hari sejak paket ini dibuat.

----------------------------------------------------------------------
4. CARA ME-RESET DATA DEMO
----------------------------------------------------------------------
Jika data demo sudah banyak dimodifikasi dan Anda ingin mengembalikannya 
ke data simulasi awal:
- Klik dua kali file "RESET_DEMO.bat".
- Masukkan password PostgreSQL Anda saat diminta.
- Semua data akan dikembalikan ke kondisi default awal.

----------------------------------------------------------------------
5. KONTAK LISENSI PENUH
----------------------------------------------------------------------
Untuk pemesanan lisensi penuh tanpa batasan, hubungi:
📞 WhatsApp: 082124130065
📧 Email   : info@smartattendance.co.id

======================================================================
© 2026 Adam Rizky — Smart Attendance Pro
======================================================================
`;
    fs.writeFileSync(path.join(releaseDir, 'PANDUAN_DEMO.txt'), panduanDemo);
    console.log('   ✅ PANDUAN_DEMO.txt created');

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║           ✅  DEMO PACKAGE CREATED SUCCESSFULLY!          ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  Output Folder : RELEASE_DEMO                             ║');
    console.log('║                                                           ║');
    console.log('║  Isi Paket:                                               ║');
    console.log('║  📁 backend/        (server API ter-obfuscate)            ║');
    console.log('║  📁 frontend/       (web app production build)            ║');
    console.log('║  📄 START_DEMO.bat  (launcher one-click)                  ║');
    console.log('║  📄 RESET_DEMO.bat  (reset database demo)                 ║');
    console.log('║  📄 PANDUAN_DEMO.txt(panduan dan akun login)             ║');
    console.log('║  📄 LICENSE_DEMO.txt(informasi lisensi trial 30 hari)     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

  } catch (err) {
    console.error('❌ Build error:', err.message);
  }
})();
