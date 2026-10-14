# Recreates deploy.bat in the repo root (same content as git HEAD).
# Run in PowerShell from this folder:  .\restore-deploy.ps1
# If you get Access is denied, close Cursor, then run PowerShell as Administrator.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$source = Join-Path $PSScriptRoot "scripts\deploy.bat"
$dest = Join-Path $PSScriptRoot "deploy.bat"

if (-not (Test-Path -LiteralPath $source)) {
  throw "Missing scripts\deploy.bat"
}

Copy-Item -LiteralPath $source -Destination $dest -Force
Write-Host "OK deploy.bat"
git status deploy.bat
