@echo off
setlocal enabledelayedexpansion
title EA Token Service Installer
color 0A

echo.
echo  ============================================
echo     EA TOKEN SERVICE - ONE-CLICK INSTALLER
echo  ============================================
echo.

:: Check if we're in the right directory
if not exist "bartender.db" (
    echo  [ERROR] bartender.db not found!
    echo.
    echo  Please extract this zip to your bot folder
    echo  and run install.bat from there.
    echo.
    pause
    exit /b 1
)

:: Confirm before proceeding
echo  This will:
echo    1. Backup your current files
echo    2. Install EA Token Service files
echo    3. Replace index.js with updated version
echo    4. Update the database
echo    5. Install required npm package
echo.
echo  Your current files will be backed up to a 'backup_' folder.
echo.
set /p CONFIRM="  Continue? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo  Cancelled.
    pause
    exit /b 0
)

echo.
echo  ============================================
echo  [1/5] Creating Backup
echo  ============================================

:: Create backup folder with timestamp
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set BACKUP_DIR=backup_%datetime:~0,8%_%datetime:~8,6%
mkdir "%BACKUP_DIR%" 2>nul

:: Backup critical files
if exist "index.js" copy /Y "index.js" "%BACKUP_DIR%\" >nul
if exist "db.js" copy /Y "db.js" "%BACKUP_DIR%\" >nul
if exist "bartender.db" copy /Y "bartender.db" "%BACKUP_DIR%\" >nul
if exist "EA" xcopy "EA" "%BACKUP_DIR%\EA\" /E /I /Q >nul 2>nul

echo  [OK] Backup created: %BACKUP_DIR%

echo.
echo  ============================================
echo  [2/5] Installing EA Token Service Files
echo  ============================================

:: Create EA folder if it doesn't exist
if not exist "EA" mkdir EA

:: Copy new EA files
copy /Y "ea-api.js" "EA\" >nul
copy /Y "ea-account-manager.js" "EA\" >nul
copy /Y "ea-token-service.js" "EA\" >nul
copy /Y "ea-get-token-helper.js" "EA\" >nul

echo  [OK] EA files installed:
echo       - EA/ea-api.js
echo       - EA/ea-account-manager.js
echo       - EA/ea-token-service.js
echo       - EA/ea-get-token-helper.js

echo.
echo  ============================================
echo  [3/5] Updating index.js
echo  ============================================

:: Replace index.js with the updated version
copy /Y "index-new.js" "index.js" >nul

echo  [OK] index.js updated with EA Token Service

echo.
echo  ============================================
echo  [4/5] Running Database Migration
echo  ============================================

:: Run the migration script
node migrate-ea-db.js
if errorlevel 1 (
    echo  [WARN] Migration had issues - check output above
) else (
    echo  [OK] Database updated
)

echo.
echo  ============================================
echo  [5/5] Installing Dependencies
echo  ============================================

:: Install xml2js
call npm install xml2js --save >nul 2>&1
if errorlevel 1 (
    echo  [WARN] Could not install xml2js automatically
    echo        Run manually: npm install xml2js
) else (
    echo  [OK] xml2js installed
)

echo.
echo  ============================================
echo      INSTALLATION COMPLETE!
echo  ============================================
echo.
echo  Next Steps:
echo.
echo  1. RESTART YOUR BOT
echo     pm2 restart all
echo     -or-
echo     node index.js
echo.
echo  2. VERIFY IT WORKS
echo     Run: /ea-accounts
echo     (Should show your accounts with "No token" status)
echo.
echo  3. SET ACCESS TOKENS
echo     For each account, get a token from EA Desktop:
echo       a. Make sure EA Desktop is logged in
echo       b. Run: node EA/ea-get-token-helper.js accountname
echo       c. Copy the token
echo       d. In Discord: /ea-updatetoken accountname "token"
echo.
echo  4. TEST TOKEN GENERATION
echo     Open an EA ticket and try generating a token!
echo.
echo  Backup Location: %BACKUP_DIR%
echo.
echo  If something goes wrong:
echo    copy "%BACKUP_DIR%\index.js" "index.js"
echo.
pause
