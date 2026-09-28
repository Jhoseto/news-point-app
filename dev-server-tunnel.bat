@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "NP2_KEY=%USERPROFILE%\.ssh\np2_newspoint"
if not exist "%NP2_KEY%" (
  echo Lipsva SSH kliuchat: %NP2_KEY%
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$listen = Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue; if ($listen) { exit 0 }; $key = $env:USERPROFILE + '\.ssh\np2_newspoint'; Start-Process -WindowStyle Minimized -FilePath 'ssh' -ArgumentList @('-i',$key,'-p','6543','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-N','-L','127.0.0.1:5433:127.0.0.1:5432','np2@95.217.114.220'); $ready = $false; foreach ($i in 1..20) { Start-Sleep -Seconds 1; if (Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break } }; if (-not $ready) { exit 1 }"

if errorlevel 1 (
  echo Tunnelut kum bazata na servera ne trugna. Proveri SSH kliucha i che port 6543 e otvoren.
  exit /b 1
)

echo Bazata na servera e na 127.0.0.1:5433
exit /b 0
