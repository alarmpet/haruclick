@echo off
cd /d "%~dp0"
echo Starting 하루클릭 (Development Client)...
echo loading .env...
if exist .env (
    for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
        if not "%%b"=="" (
            set "%%a=%%b"
        )
    )
)

echo.
echo ========================================================
echo [IMPORTANT]
echo This mode ONLY works with the custom app you just built.
echo Please make sure you have installed the APK on your phone.
echo ========================================================
echo.

call npx expo start --dev-client --lan
pause
