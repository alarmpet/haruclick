@echo off
echo ========================================================
echo   [HaruClick] Local Android Development Build Script
echo ========================================================
echo.
echo This script will build the Android app locally using your PC's power.
echo It creates a 'Development Build' which supports all native modules.
echo.
echo Prerequisites:
echo  1. Java (JDK 11 or 17) must be installed.
echo  2. Android SDK must be set up (ANDROID_HOME environment variable).
echo  3. Docker (Optional, often not needed for Expo local builds if SDK is present).
echo.
echo Step 1: Cleaning previous builds...
rmdir /s /q android\app\build 2>nul

echo.
echo Step 2: Starting Local Build...
echo Command: eas build --platform android --profile development --local
echo.
echo [NOTE] This process may take 10~20 minutes depending on your PC.
echo.

call eas build --platform android --profile development --local

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build Failed!
    echo Please check if you have JDK and Android SDK installed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo   [SUCCESS] Build Complete!
echo ========================================================
echo The APK file path should be printed above.
echo Transfer this APK to your device and install it.
echo.
pause
