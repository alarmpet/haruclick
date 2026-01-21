@echo off
cd /d "%~dp0"
echo ========================================================
echo   [HaruClick] Auto Run Script (USB/Localhost Mode)
echo ========================================================
echo.
echo [CHECK] Checking for zombie processes on port 8081...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8081" ^| find "LISTENING"') do (
    echo [FIX] Killing process %%a occupying port 8081...
    taskkill /f /pid %%a >nul 2>&1
)
echo.
echo This mode forces the app to connect via USB cable (Localhost).
echo It fixes "Network Error" or "Problem loading project" issues.
echo.

echo env: Loading .env...
if exist .env (
    for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
        if not "%%b"=="" (
            set "%%a=%%b"
        )
    )
)

:ask_admin
set /p START_ADMIN="Start Admin Web Dashboard? (Y/N, default N): "
if /i "%START_ADMIN%"=="Y" (
    start cmd /k "..\admin-web\auto-run.bat"
)

echo.
echo Starting Server (Localhost Mode)...
echo [STEP 1] Connect your phone via USB.
echo [STEP 2] Resetting ADB Connection...
adb kill-server
adb start-server
echo [STEP 2.1] Setting up Port Forwarding...
adb reverse tcp:8081 tcp:8081


echo.
echo [STEP 3] Starting Server...
echo When app opens, if it fails, shake phone and Reload.
echo.
call npx expo start --dev-client --localhost --port 8081 --clear
pause
