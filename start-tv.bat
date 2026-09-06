@echo off
echo Starting TV Player...
echo URL: http://localhost:3002
cd /d "%~dp0android-tv"
call npx serve public -p 3002
pause
