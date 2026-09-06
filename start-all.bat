@echo off
echo ==========================================
echo Digital Signage System - Starting All Services
echo ==========================================
echo.
echo Backend API:  http://localhost:3001
echo Web CMS:      http://localhost:3000
echo TV Player:    http://localhost:3002
echo.
echo Starting services in separate windows...
echo.

start "Backend API" cmd /k "cd /d "%~dp0backend" && echo Starting Backend API... && npm run dev"
timeout /t 2 >nul

start "Web CMS" cmd /k "cd /d "%~dp0web-cms" && echo Starting Web CMS... && npm run dev"
timeout /t 2 >nul

start "TV Player" cmd /k "cd /d "%~dp0android-tv" && echo Starting TV Player... && npx serve public -p 3002"

echo.
echo All services started!
echo.
echo Press any key to close this window (services will keep running)
pause >nul
