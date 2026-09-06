@echo off
echo Starting Backend API Server...
echo URL: http://localhost:3001
cd /d "%~dp0backend"
call npm run dev
pause
