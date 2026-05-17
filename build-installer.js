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
  if (fs.existsSync(path.join(rootDir, 'frontend', '.env.example'))) {
    fs.copyFileSync(path.join(rootDir, 'frontend', '.env.example'), path.join(releaseDir, 'frontend', '.env.example'));
  }

  // 6. Create START.bat for Client
  const batContent = `@echo off
title Smart Attendance Pro
color 0A
echo ===================================================
echo    Smart Attendance Pro - Installer
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
echo [4/4] Memulai sistem...
start "Backend" cmd /k "cd backend && npm run start:prod"
start "Frontend" cmd /k "cd frontend && npm start"

echo.
echo ===================================================
echo   Sistem berhasil dijalankan!
echo   Buka browser dan akses alamat di bawah ini.
echo   (Port sesuai konfigurasi .env)
echo ===================================================
pause
`;
  fs.writeFileSync(path.join(releaseDir, 'START_APP.bat'), batContent);

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
