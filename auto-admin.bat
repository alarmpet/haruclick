@echo off
cd /d "%~dp0..\admin-web"
echo ========================================================
echo   [HaruClick] Launching Admin Web Dashboard...
echo ========================================================
echo.
if exist "auto-run.bat" (
    call auto-run.bat
) else (
    echo [ERROR] auto-run.bat not found in admin-web directory!
    pause
)
