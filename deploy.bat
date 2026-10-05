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

echo [1/4] Packing the current local source...
if exist "%ARCHIVE%" del /f /q "%ARCHIVE%"
tar -czf "%ARCHIVE%" ^
  --exclude=node_modules ^
  --exclude=.next ^
  --exclude=.git ^
  --exclude=.turbo ^
  --exclude=.pnpm-store ^
  --exclude=logs ^
  --exclude=.env.local ^
  --exclude=.env.tunnel ^
  --exclude=.cursor ^
  --exclude=.claude ^
  --exclude=.codex ^
  --exclude=.gemini ^
  --exclude=.playwright-mcp ^
  --exclude=.tts-cache ^
  --exclude=.tts-voices ^
  --exclude=.shots ^
  --exclude=coverage ^
  --exclude=playwright-report ^
  --exclude=test-results ^
  --exclude=blob-report ^
  --exclude=out ^
  --exclude=tests/reports ^
  --exclude=docs/references ^
  --exclude=docs/review ^
  --exclude=*.tsbuildinfo ^
  -C "%~dp0." .
if errorlevel 1 (
  echo Pack failed.
  pause
  exit /b 1
)

for %%A in ("%ARCHIVE%") do set "LOCAL_SIZE=%%~zA"
if not defined LOCAL_SIZE (
  echo Pack produced no archive.
  pause
  exit /b 1
)
if "%LOCAL_SIZE%"=="0" (
  echo Pack produced an empty archive.
  pause
  exit /b 1
)

echo Verifying local archive (%LOCAL_SIZE% bytes)...
tar -tzf "%ARCHIVE%" >nul
if errorlevel 1 (
  echo Pack produced a truncated or unreadable archive. Deploy stopped.
  echo Delete "%ARCHIVE%" and retry. If it keeps failing, close editors locking files under the repo.
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

echo Checking remote archive size matches local...
set "SIZEFILE=%TEMP%\np2-remote-size.txt"
if exist "%SIZEFILE%" del /f /q "%SIZEFILE%"
ssh -i "%KEY%" -p 6543 -o IdentitiesOnly=yes %HOST% "wc -c ~/np2-app.tgz" > "%SIZEFILE%"
if errorlevel 1 (
  echo Could not read remote archive size.
  echo Extract skipped. The live site was not replaced.
  pause
  exit /b 1
)
set "REMOTE_SIZE="
for /f "usebackq tokens=1" %%R in ("%SIZEFILE%") do set "REMOTE_SIZE=%%R"
del /f /q "%SIZEFILE%" >nul 2>&1
if not "%REMOTE_SIZE%"=="%LOCAL_SIZE%" (
  echo Upload size mismatch. Local=%LOCAL_SIZE% Remote=%REMOTE_SIZE%
  echo Extract skipped. The live site was not replaced.
  ssh -i "%KEY%" -p 6543 -o IdentitiesOnly=yes %HOST% "rm -f ~/np2-app.tgz" >nul 2>&1
  pause
  exit /b 1
)

echo [3/4] Extracting beside the live site. It stays up during the build...
ssh -i "%KEY%" -p 6543 -o IdentitiesOnly=yes %HOST% "rm -rf ~/newspoint-app.next && mkdir -p ~/newspoint-app.next && tar -xzf ~/np2-app.tgz -C ~/newspoint-app.next && rm -f ~/np2-app.tgz && sed -i 's/\r$//' ~/newspoint-app.next/deploy/np2/*.sh"
if errorlevel 1 (
  echo Extract failed. The live site was not replaced.
  pause
  exit /b 1
)

echo [4/4] Build, then replace the server copy and restart...
ssh -i "%KEY%" -p 6543 -o IdentitiesOnly=yes %HOST% "bash ~/newspoint-app.next/deploy/np2/remote-deploy.sh"
if errorlevel 1 (
  echo Deploy failed. If the build failed, the running NewsPoint copy was left in place.
  echo The old WordPress site was not part of this command.
  pause
  exit /b 1
)

echo.
echo Deploy finished. The new site was rebuilt and restarted.
echo.
pause
endlocal
