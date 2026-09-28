@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo NewsPoint 2.0 - Cloudflare tunnel (publilen link kam localhost:3000)
echo.
echo Za demo na hora: samo demo.bat (vsichko avtomatichno).
echo.

set "CF="
where cloudflared >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%I in ('where cloudflared 2^>nul') do set "CF=%%I" & goto :cf_ok
)
if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined CF if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"

:cf_ok
if not defined CF (
  echo Greshka: cloudflared ne e nameren.
  echo Instalirai: winget install Cloudflare.cloudflared
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if (-not $c) { Write-Host 'VNIMANIE: port 3000 ne slusha. Pusni restart.bat ili pnpm dev predi tunela.' -ForegroundColor Yellow; Write-Host '' }"

echo Izpolzva: %CF%
echo Kopirai https://....trycloudflare.com ot izhoda nadolu.
echo Hover modali v Posledni novini: samo desktop (lg+) s mishka.
echo Za spirane: Ctrl+C
echo.

"%CF%" tunnel --url http://127.0.0.1:3000

echo.
echo Tunelat spria.
pause
endlocal
