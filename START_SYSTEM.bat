@echo off
title Smart Attendance Pro - System Launcher
color 0A
echo.
echo  ============================================
echo       Smart Attendance Pro - Launcher
echo  ============================================
echo.

echo [1/2] Starting Backend Server (Port 5000)...
cd /d "%~dp0backend"
start "Smart Attendance - Backend" cmd /k "npm run dev"

echo [2/2] Starting Frontend Server (Port 5175)...
cd /d "%~dp0frontend"
start "Smart Attendance - Frontend" cmd /k "npm run dev"

echo.
echo  --- Kedua server sedang berjalan! ---
echo  - Backend:  http://localhost:5000/api/health
echo  - Frontend: http://localhost:5175
echo.
echo  Akun Login Riil:
echo  1. Admin:    user=admin, pass=admin123
echo  2. Employee: user=EMP007 (Adam), pass=password123
echo.
echo  Note: Cek jendela terminal Vite untuk port yang aktif.
echo.
pause
