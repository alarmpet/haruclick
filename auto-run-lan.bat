@echo off
cd /d "%~dp0"
echo Starting 하루클릭 with LAN (Faster & Stable)...
echo env: load .env
if exist .env (
    for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
        if not "%%b"=="" (
            set "%%a=%%b"
            echo env: export %%a
        )
    )
) else (
    echo Warning: .env file not found. Using default values.
)

:ask_admin
set /p START_ADMIN="Start Admin Web Dashboard (Y/N)? "
if /i "%START_ADMIN%"=="Y" (
    echo Starting Admin Web...
    start cmd /k "..\admin-web\auto-run.bat"
)

echo Starting Metro Bundler (LAN Mode)...
call npx expo start --dev-client --lan
pause
