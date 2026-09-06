@echo off
REM This script forwards Docker Desktop (WSL2) ports to your LAN.
REM Run as Administrator when using Docker Desktop on Windows.

echo ==========================================================
echo Docker Desktop WSL2 Port Forward Setup
echo ==========================================================
echo.
echo Docker Desktop on Windows with WSL2 backend does NOT
echo expose container ports to your WiFi network by default.
echo This script fixes that by forwarding ports using netsh.
echo.
echo Required ports: 3000 (CMS), 3001 (API), 3002 (Player), 9000 (MinIO)
echo.
pause

echo.
echo [1/4] Forwarding port 3000 (CMS)...
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=127.0.0.1

echo [2/4] Forwarding port 3001 (Backend API)...
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=127.0.0.1

echo [3/4] Forwarding port 3002 (TV Player)...
netsh interface portproxy add v4tov4 listenport=3002 listenaddress=0.0.0.0 connectport=3002 connectaddress=127.0.0.1

echo [4/4] Forwarding port 9000 (MinIO S3)...
netsh interface portproxy add v4tov4 listenport=9000 listenaddress=0.0.0.0 connectport=9000 connectaddress=127.0.0.1

echo.
echo ==========================================================
echo Adding Windows Firewall rules...
echo ==========================================================
netsh advfirewall firewall add rule name="DigitalSignage-3000" dir=in action=allow protocol=tcp localport=3000
netsh advfirewall firewall add rule name="DigitalSignage-3001" dir=in action=allow protocol=tcp localport=3001
netsh advfirewall firewall add rule name="DigitalSignage-3002" dir=in action=allow protocol=tcp localport=3002
netsh advfirewall firewall add rule name="DigitalSignage-9000" dir=in action=allow protocol=tcp localport=9000

echo.
echo ==========================================================
echo Done! Verifying port proxies...
echo ==========================================================
netsh interface portproxy show all

echo.
echo ==========================================================
echo Your PC's IP address:
echo ==========================================================
ipconfig | findstr /i "IPv4"

echo.
echo ==========================================================
echo NEXT STEPS:
echo ==========================================================
echo 1. Make sure docker-compose is running: docker-compose up -d
echo 2. On your phone/TV, the server should now be reachable at:
echo    http://YOUR_PC_IP:3001
echo 3. Open the CMS at http://YOUR_PC_IP:3000
echo 4. Open the player at http://YOUR_PC_IP:3002
echo.
echo To REMOVE these forwards later, run remove-port-forward.bat
echo.
pause
