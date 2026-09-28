@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo NewsPoint 2.0 - restart na lokalnite dev serveri
echo.

echo [1/3] Vrazka kum bazata na servera...
call "%~dp0dev-server-tunnel.bat"
if errorlevel 1 (
  pause
  exit /b 1
)

echo [2/3] Spiram procesite na port 3000 (web) i 3001 (studio)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = 3000, 3001; foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $procId = $_.OwningProcess; if ($procId) { Write-Host ('  port ' + $port + ' -> PID ' + $procId); Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } } }"

timeout /t 2 /nobreak >nul

where pnpm >nul 2>&1
if errorlevel 1 (
  echo Greshka: pnpm ne e nameren v PATH. Instalirai go ili otvori terminal ot pnpm.
  pause
  exit /b 1
)

echo [3/3] Startiram pnpm dev. Sinhronat ot staria sait varvi na servera, ne tuk.
echo       Web:    http://localhost:3000
echo       Studio: http://localhost:3001
echo       Za spirane: Ctrl+C
echo.

set "NODE_OPTIONS=--use-system-ca"
call pnpm dev

endlocal
