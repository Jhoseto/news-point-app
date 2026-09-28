@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo Spiram port 3000 i 3001...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = 3000, 3001; foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
timeout /t 2 /nobreak >nul

set "NODE_OPTIONS=--use-system-ca"
start "NewsPoint Web 3000" cmd /k "cd /d ""%~dp0"" && set NODE_OPTIONS=--use-system-ca && set NP_ALLOW_CF_TUNNEL=1 && pnpm --filter @newspoint/web start"
timeout /t 2 /nobreak >nul
start "NewsPoint Studio 3001" cmd /k "cd /d ""%~dp0"" && set NODE_OPTIONS=--use-system-ca && set NP_ALLOW_CF_TUNNEL=1 && pnpm --filter @newspoint/studio start"
echo Serverite startiraha otnovo.
endlocal
