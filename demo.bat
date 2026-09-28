@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  NewsPoint DEMO - edin klik, link za horata
echo  build + sait + tunnel + Studio login
echo.
echo  NE zatvariai prozorcite Web / Studio.
echo  Linkat izliza tuk i v DEMO-LINK.txt
echo.

where pnpm >nul 2>&1
if errorlevel 1 (
  echo Greshka: pnpm ne e v PATH.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-public-demo.ps1"
if errorlevel 1 (
  echo.
  echo Demo FAIL — proveri .env.local i internet.
  pause
  exit /b 1
)

endlocal
