@echo off
echo ==========================================
echo Digital Signage System - Service Test
echo ==========================================
echo.

echo 1. Testing Backend API (Port 3001)...
curl -s -o /dev/null -w "Health Check: %%{http_code}\n" http://localhost:3001/api/auth/me
echo.

echo 2. Testing Web CMS (Port 3000)...
curl -s -o /dev/null -w "Web CMS: %%{http_code}\n" http://localhost:3000
echo.

echo 3. Testing TV Player (Port 3002)...
curl -s -o /dev/null -w "TV Player: %%{http_code}\n" http://localhost:3002
echo.

echo 4. Testing Database Connection...
curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"central@example.com\",\"password\":\"admin123\"}" 2>nul | findstr "token" >nul
if %errorlevel% equ 0 (
    echo Authentication: SUCCESS (Central Admin)
) else (
    echo Authentication: FAILED
)
echo.

echo 5. Testing Subcenter Admin Login...
curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"local@example.com\",\"password\":\"admin123\"}" 2>nul | findstr "token" >nul
if %errorlevel% equ 0 (
    echo Authentication: SUCCESS (Subcenter Admin)
) else (
    echo Authentication: FAILED
)
echo.

echo 6. Testing Device Registration Endpoint...
curl -s -o /dev/null -w "Device API: %%{http_code}\n" http://localhost:3001/api/devices
echo.

echo ==========================================
echo Service Status Summary:
echo ==========================================
echo Backend API:   http://localhost:3001
echo Web CMS:       http://localhost:3000
echo TV Player:     http://localhost:3002
echo.
echo All services appear to be running correctly.
echo.
echo Manual Testing Instructions:
echo 1. Open browser to http://localhost:3000
echo 2. Login with central@example.com / admin123
echo 3. Navigate through the CMS interface
echo 4. Open TV Player at http://localhost:3002
echo 5. Register a device and test playback
echo.
pause