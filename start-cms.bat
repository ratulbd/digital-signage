@echo off
echo Starting Web CMS Frontend...
echo URL: http://localhost:3000
cd /d "%~dp0web-cms"
call npm run dev
pause
