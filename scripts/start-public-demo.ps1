# One-shot public demo: production servers + Cloudflare tunnel. No manual URL paste.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$env:NODE_OPTIONS = "--use-system-ca"
$env:NP_ALLOW_CF_TUNNEL = "1"

function Stop-DemoPorts {
  foreach ($port in 3000, 3001) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
  Start-Sleep -Seconds 2
}

function Wait-ListenPort([int]$Port, [int]$Seconds = 90) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { return }
    Start-Sleep -Milliseconds 400
  }
  throw "Port $Port did not start in time."
}

function Wait-WebReady {
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/" -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { return }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  throw "Web na :3000 ne otgovaria. Proveri prozoreca NewsPoint Web."
}

function Find-Cloudflared {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($path in @(
      "${env:ProgramFiles}\cloudflared\cloudflared.exe",
      "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"
    )) {
    if (Test-Path $path) { return $path }
  }
  throw "cloudflared not found. Run: winget install Cloudflare.cloudflared"
}

function Needs-Build([string]$AppRel) {
  if ($env:NP_DEMO_FORCE_BUILD -eq "1") { return $true }
  $buildId = Join-Path (Join-Path $root $AppRel) ".next\BUILD_ID"
  return -not (Test-Path $buildId)
}

function Start-DemoServer([string]$Title, [string]$Filter) {
  $inner = @(
    "cd /d `"$root`"",
    "set NODE_OPTIONS=--use-system-ca",
    "set NP_ALLOW_CF_TUNNEL=1",
    "pnpm --filter $Filter start"
  ) -join " && "
  Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $inner) -WindowStyle Normal
}

Write-Host ""
Write-Host "NewsPoint public demo (production + tunnel)"
Write-Host ""

Stop-DemoPorts

if (Needs-Build "apps\web") {
  Write-Host "[build] web..."
  & pnpm --filter @newspoint/web build
  if ($LASTEXITCODE -ne 0) { throw "web build failed" }
} else {
  Write-Host "[build] web skip - ima build. NP_DEMO_FORCE_BUILD=1 za rebuild."
}

Write-Host "[start] web :3000 (studio sled tunnel URL)..."
Start-DemoServer "NewsPoint Web 3000" "@newspoint/web"
Wait-ListenPort 3000
Write-Host "[start] chakam web da otgovori..."
Wait-WebReady

Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$cf = Find-Cloudflared
$logFile = Join-Path $root ".cloudflared-demo.log"
Remove-Item $logFile -Force -ErrorAction SilentlyContinue

Write-Host "[tunnel] cloudflared (do 90 sec)..."
$proc = Start-Process -FilePath $cf `
  -ArgumentList @("tunnel", "--url", "http://127.0.0.1:3000") `
  -RedirectStandardError $logFile `
  -PassThru `
  -WindowStyle Hidden

$demoUrl = $null
for ($i = 1; $i -le 90; $i++) {
  if ($proc.HasExited -and $proc.ExitCode -ne 0) {
    $tail = ""
    if (Test-Path $logFile) { $tail = (Get-Content $logFile -Raw -ErrorAction SilentlyContinue) }
    throw "cloudflared spria. Log: $logFile`n$tail"
  }
  if (Test-Path $logFile) {
    $text = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
    if ($text -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
      $demoUrl = $Matches[1]
      break
    }
  }
  if ($i % 5 -eq 0) { Write-Host "  ... $i s" }
  Start-Sleep -Seconds 1
}

if (-not $demoUrl) {
  if (Test-Path $logFile) { Get-Content $logFile | Write-Host }
  throw "Nama URL ot cloudflared. Proveri internet ili pusni tunnel.bat otdelno."
}

Write-Host "[auth] Studio login URL..."
& (Join-Path $root "scripts\set-tunnel-url.ps1") -PublicUrl $demoUrl
Write-Host "[build] studio..."
& pnpm --filter @newspoint/studio build
if ($LASTEXITCODE -ne 0) { throw "studio build failed" }
Write-Host "[start] studio :3001 (edinstven put)..."
Start-DemoServer "NewsPoint Studio 3001" "@newspoint/studio"
Wait-ListenPort 3001

$linkFile = Join-Path $root "DEMO-LINK.txt"
$studioUrl = "$demoUrl/admin/login/"
@(
  $demoUrl
  $studioUrl
  ""
  "Ne zatvariai: prozorec Web, prozorec Studio (sled krai), i tozi tunnel."
) | Set-Content -Path $linkFile -Encoding utf8

try {
  Set-Clipboard -Value $demoUrl
} catch {
  # Clipboard optional
}

Write-Host ""
Write-Host "========================================"
Write-Host "  DEMO LINK:"
Write-Host "  $demoUrl"
Write-Host "  Studio: $studioUrl"
Write-Host "========================================"
Write-Host "Saved: DEMO-LINK.txt"
Write-Host ""
Write-Host "Tunnel running. Ctrl+C stops the public link."
Write-Host ""

try {
  $proc.WaitForExit()
} finally {
  if (Test-Path $logFile) { Remove-Item $logFile -Force -ErrorAction SilentlyContinue }
}
