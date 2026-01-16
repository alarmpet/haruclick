@echo off
cd /d "%~dp0"
echo Starting 하루클릭 with Tunnel...
echo Check the terminal for the tunnel URL (exp://...).
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
call npx expo start --dev-client --tunnel
pause
