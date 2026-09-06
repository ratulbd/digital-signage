@echo off
REM Start the reliable LAN proxy for Docker Desktop WSL2
REM Run this AFTER 'docker-compose up -d'

echo Starting LAN Proxy for Docker Desktop WSL2...
echo This makes Docker ports accessible from your phone on WiFi.
echo.
node "%~dp0windows-proxy.js"
