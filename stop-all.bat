@echo off
echo Stopping all Digital Signage services...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM nodemon.exe 2>nul
echo.
echo All services stopped!
pause
