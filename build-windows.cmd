@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Install Node.js LTS from https://nodejs.org, then reopen this file.
  pause
  exit /b 1
)
call npm ci
if errorlevel 1 goto failed
call npm test
if errorlevel 1 goto failed
call npm run dist
if errorlevel 1 goto failed
echo Your per-user Windows installer is in the dist folder.
explorer dist
pause
exit /b 0
:failed
echo Build failed. Copy the error above for troubleshooting.
pause
exit /b 1
