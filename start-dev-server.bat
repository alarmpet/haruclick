@echo off
echo ========================================================
echo   [HaruClick] Start Development Server
echo ========================================================
echo.
echo This script starts the Metro Bundler server.
echo Your Native App on the phone needs this server to load the code.
echo.
echo [INSTRUCTIONS]
echo 1. Keep this window OPEN.
echo 2. If the app on your phone shows an error, shake the phone 
echo    (or press 'R' in this terminal) to RELOAD.
echo.

call npx expo start --dev-client

pause
