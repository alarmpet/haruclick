@echo off
cd /d "%~dp0"
echo ========================================================
echo   [HaruClick] Auto Run Script (Tunnel Mode)
echo ========================================================
echo.
echo This mode connects via ngrok Tunnel.
echo Slower than LAN, but works reliably across networks/firewalls.
echo.

echo [CHECK] Checking for zombie processes on port 8081...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8081" ^| find "LISTENING"') do (
    echo [FIX] Killing process %%a occupying port 8081...
    taskkill /f /pid %%a >nul 2>&1
)
echo.


echo Starting Server (Tunnel Mode)...
echo.
echo [DEBUG] Setting extended ngrok timeout (120 seconds)...
set EXPO_TUNNEL_TIMEOUT=120000
set NGROK_REGION=us
echo [DEBUG] Starting Expo with tunnel mode...
echo.
call npx expo start --dev-client --tunnel --clear
echo.
echo [DEBUG] If connection failed, try:
echo   1. Check firewall: Windows Defender might be blocking ngrok
echo   2. Visit https://status.ngrok.com/ to check service status
echo   3. Consider reinstalling node_modules if issue persists
echo.
pause

