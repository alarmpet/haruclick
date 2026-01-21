@echo off
echo ========================================================
echo   [HaruClick] Run Android Locally (Native)
echo ========================================================
echo.
echo 'eas build --local' command failed potentially due to Windows compatibility.
echo Switching to standard 'npx expo run:android' command.
echo.
echo This command will:
echo  1. Generate native Android project files (Prebuild)
echo  2. Compile the Android app using Gradle
echo  3. Install it on your connected Device or Emulator
echo  4. Start the Metro Bundler
echo.
echo [REQUIREMENTS]
echo  - Android device connected via USB (with USB Debugging ON)
echo    OR Android Emulator running
echo  - Java JDK & Android SDK installed
echo.

echo Step 1: Prebuilding...
call npx expo prebuild --no-install

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Prebuild failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Step 2: Compiling & Installing...
echo This may take a while for the first time...
call npx expo run:android

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to run android app.
    echo Common fixes:
    echo  - Check if a device is connected (adb devices)
    echo  - Check if JAVA_HOME is set correctly
    echo  - Check if Android SDK is setup
    pause
    exit /b %ERRORLEVEL%
)

pause
