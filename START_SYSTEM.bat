@echo off
title Smart Attendance Pro - System Launcher
color 0A
echo.
echo  ============================================
echo       Smart Attendance Pro - Launcher
echo  ============================================
echo.

echo [1/2] Starting Backend Server...
cd /d "%~dp0backend"
start "Smart Attendance - Backend" cmd /k "npm run dev"

:: Beri waktu backend untuk start terlebih dahulu
echo     Waiting for backend to initialize...
timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend Server...
cd /d "%~dp0frontend"
start "Smart Attendance - Frontend" cmd /k "npm run dev -- --host 0.0.0.0"

echo.
echo  --- Kedua server sedang berjalan! ---
echo  - Backend:  http://localhost:5000/api/health
echo  - Frontend: http://localhost:5173
echo.
echo  Note: Port aktual tergantung konfigurasi .env
echo  Login via browser di alamat Frontend di atas.
echo.
echo  Default Login:
echo    Username: admin
echo    Password: admin123
echo.
pause
