@echo off
cd /d "%~dp0"
echo ========================================================
echo   [HaruClick] Clean Reinstall node_modules
echo ========================================================
echo.
echo This will:
echo   1. Remove node_modules folder
echo   2. Clear npm cache
echo   3. Reinstall all dependencies
echo   4. Verify ngrok binary
echo.
echo WARNING: This may take 5-10 minutes!
echo.
pause

echo.
echo [STEP 1/5] Removing node_modules...
if exist "node_modules" (
    rmdir /s /q "node_modules"
    echo [OK] node_modules removed
) else (
    echo [SKIP] node_modules folder not found
)

echo.
echo [STEP 2/5] Clearing npm cache...
call npm cache clean --force
echo [OK] npm cache cleared

echo.
echo [STEP 3/5] Installing dependencies (this may take a while)...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] npm install failed!
    pause
    exit /b 1
)
echo [OK] Dependencies installed

echo.
echo [STEP 4/5] Verifying ngrok binary...
if exist "node_modules\.bin\ngrok.cmd" (
    echo [OK] ngrok.cmd found
) else (
    echo [WARN] ngrok.cmd not found
)

if exist "node_modules\@expo\ngrok-bin\bin\ngrok.exe" (
    echo [OK] ngrok.exe found
    
    REM Test ngrok binary
    node_modules\@expo\ngrok-bin\bin\ngrok.exe version >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [OK] ngrok binary is executable
    ) else (
        echo [WARN] ngrok binary may have issues
    )
) else (
    echo [WARN] ngrok.exe not found
)

echo.
echo [STEP 5/5] Cleaning Metro bundler cache...
call npx expo start --clear --max-workers 1 >nul 2>&1
timeout /t 2 >nul
taskkill /f /im node.exe >nul 2>&1
echo [OK] Cache cleared

echo.
echo ========================================================
echo   [SUCCESS] Reinstall Complete!
echo ========================================================
echo.
echo You can now run: auto-run-tunnel.bat
echo.
pause
