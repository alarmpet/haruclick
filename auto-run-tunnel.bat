@echo off
setlocal enableextensions
cd /d "%~dp0"

echo ========================================================
echo   [HaruClick] Auto Run Script (Tunnel + Web Mode)
echo ========================================================
echo.
echo  - Mobile: ngrok Tunnel mode  ^=^> http://localhost:8081
echo  - Browser: http://localhost:19006
echo.

echo [CHECK] Cleaning up zombie processes on port 8081...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8081" ^| find "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [CHECK] Cleaning up zombie processes on port 19006...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":19006" ^| find "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)
echo.

echo [1/2] Starting Expo Web on port 19006...
echo       Open http://localhost:19006 in your browser.
if exist "%~dp0node_modules\.bin\expo.cmd" (
    start "HaruClick-Web" cmd /k "cd /d %~dp0 && call node_modules\.bin\expo.cmd start --web --port 19006"
) else (
    echo [WARN] Local expo.cmd not found. Falling back to npx.
    start "HaruClick-Web" cmd /k "cd /d %~dp0 && npx expo start --web --port 19006"
)
echo.

timeout /t 3 /nobreak >nul

echo [2/2] Starting Expo Tunnel for Mobile (port 8081)...
set EXPO_TUNNEL_TIMEOUT=180000
set NGROK_REGION=us
echo.
echo [INFO] Trying Tunnel mode first...
if exist "%~dp0node_modules\.bin\expo.cmd" (
    call node_modules\.bin\expo.cmd start --dev-client --tunnel --port 8081 --clear
) else (
    call npx expo start --dev-client --tunnel --port 8081 --clear
)

set "TUNNEL_EXIT=%ERRORLEVEL%"
if not "%TUNNEL_EXIT%"=="0" goto :fallback
goto :done

:fallback
echo.
echo [WARN] Tunnel mode failed (exit code: %TUNNEL_EXIT%).
echo [FALLBACK] Switching to LAN mode on port 8081...
echo [TIP] If tunnel is required, run fix-ngrok-firewall.ps1 as Administrator and retry.
echo.
if exist "%~dp0node_modules\.bin\expo.cmd" (
    call node_modules\.bin\expo.cmd start --dev-client --lan --port 8081 --clear
) else (
    call npx expo start --dev-client --lan --port 8081 --clear
)

:done
echo.
pause
