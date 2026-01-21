@echo off
echo ========================================================
echo   [HaruClick] Log Viewer (Wide Filter)
echo ========================================================
echo.
echo Capture logs containing 'Error', 'React', or App ID...
echo If this is blank, the app might not be running or ADB is frozen.
echo.
echo Press Ctrl+C to stop.
echo.

adb logcat -c
adb logcat | findstr /i "com.haruclick React Error Exception fatal"
pause
