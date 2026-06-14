@echo off
title BD Testify - Local Dev

echo.
echo  ============================================
echo    BD Testify - Starting Local Dev Server
echo  ============================================
echo.

REM Start Backend
echo  [1/2] Starting Backend (FastAPI)...
start "BD Testify - Backend" cmd /k "cd /d C:\BD Testify\backend && venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

REM Wait 4 seconds for backend to boot
timeout /t 4 /nobreak >nul

REM Start Frontend
echo  [2/2] Starting Frontend (React + Vite)...
start "BD Testify - Frontend" cmd /k "cd /d C:\BD Testify\frontend && npm run dev"

REM Wait for frontend to boot
timeout /t 5 /nobreak >nul

echo.
echo  ============================================
echo    App is running! Open these in your browser:
echo  ============================================
echo.
echo    Home / Landing    :  http://localhost:3000
echo    Admin Login       :  http://localhost:3000/admin/login
echo    Admin Dashboard   :  http://localhost:3000/admin/dashboard
echo    Candidates        :  http://localhost:3000/admin/candidates
echo    Live Monitoring   :  http://localhost:3000/admin/monitoring
echo    Question Manager  :  http://localhost:3000/admin/questions
echo    Invite Manager    :  http://localhost:3000/admin/invite
echo    Candidate Register:  http://localhost:3000/register
echo    QR Login          :  http://localhost:3000/qr-landing
echo    API Docs          :  http://localhost:8000/docs
echo.
echo    Admin Credentials:
echo      Email   : admin@buildingdoctor.com
echo      Password: admin123
echo.
echo  ============================================
echo.

REM Open browser
start "" "http://localhost:3000"

pause
