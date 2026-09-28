@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo NewsPoint 2.0 deploy - only the new site account np2
echo The old WordPress site is not changed.
echo.

set "KEY=%USERPROFILE%\.ssh\np2_newspoint"
set "HOST=np2@95.217.114.220"
set "ARCHIVE=%TEMP%\np2-app.tgz"

if not exist "%KEY%" (
  echo Missing SSH key: %KEY%
  pause
  exit /b 1
)

echo [1/4] Packing source...
if exist "%ARCHIVE%" del /f /q "%ARCHIVE%"
tar -czf "%ARCHIVE%" --exclude=node_modules --exclude=.next --exclude=.git --exclude=.turbo --exclude=.env.local --exclude=.env.tunnel -C "%~dp0." .
if errorlevel 1 (
  echo Pack failed.
  pause
  exit /b 1
)

echo [2/4] Uploading...
scp -i "%KEY%" -P 6543 -o IdentitiesOnly=yes "%ARCHIVE%" %HOST%:np2-app.tgz
if errorlevel 1 (
  echo Upload failed.
  pause
  exit /b 1
)

echo [3/4] Extracting on the server...
ssh -i "%KEY%" -p 6543 -o IdentitiesOnly=yes %HOST% "mkdir -p ~/newspoint-app && tar -xzf ~/np2-app.tgz -C ~/newspoint-app && rm -f ~/np2-app.tgz && sed -i 's/\r$//' ~/newspoint-app/deploy/np2/*.sh"
if errorlevel 1 (
  echo Extract failed.
  pause
  exit /b 1
)

echo [4/4] Build and restart...
ssh -i "%KEY%" -p 6543 -o IdentitiesOnly=yes %HOST% "bash ~/newspoint-app/deploy/np2/remote-deploy.sh"
if errorlevel 1 (
  echo Deploy failed. The old site was not part of this command.
  pause
  exit /b 1
)

echo.
echo Deploy finished. The new site was rebuilt and restarted.
echo.
pause
endlocal
