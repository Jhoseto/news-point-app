param(
  [string]$HostName = "95.217.114.220",
  [int]$Port = 6543,
  [string]$User = "np2",
  [string]$Key = "$env:USERPROFILE\.ssh\np2_newspoint",
  [string]$App = "/home/np2/newspoint-app",
  [int]$IntervalSec = 5
)

if (-not (Test-Path $Key)) {
  Write-Host "Missing SSH key: $Key" -ForegroundColor Red
  exit 1
}

function Ssh-Text([string]$RemoteCommand) {
  $raw = & ssh.exe -i $Key -p $Port -o IdentitiesOnly=yes "${User}@${HostName}" $RemoteCommand 2>&1
  if ($null -eq $raw) { return "" }
  if ($raw -is [System.Array]) { return (($raw | ForEach-Object { "$_" }) -join "`n").Trim() }
  return ([string]$raw).Trim()
}

Write-Host "WP archive import (np2) - Ctrl+C to stop" -ForegroundColor Cyan
Write-Host "Progress file updates once per 100 articles (each WP page).`n"

$prevSaved = $null
$prevAt = $null

while ($true) {
  $procText = Ssh-Text "pgrep -fc import-archive.ts"
  $running = ($procText -match "(\d+)") -and ([int]$Matches[1] -gt 0)

  $jsonText = Ssh-Text "cat $App/logs/wp-archive-import.json"
  $logLine = Ssh-Text "tail -n 1 $App/logs/wp-archive-import.out"

  $page = 0
  $pages = 517
  $saved = 0
  $fail = 0
  $total = 0
  $serverAt = ""

  if ($jsonText) {
    try {
      $j = $jsonText | ConvertFrom-Json
      if ($null -ne $j.lastPage) { $page = [int]$j.lastPage }
      if ($null -ne $j.totalPages -and [int]$j.totalPages -gt 0) { $pages = [int]$j.totalPages }
      if ($null -ne $j.saved) { $saved = [int]$j.saved }
      if ($null -ne $j.failed) { $fail = [int]$j.failed }
      if ($null -ne $j.total) { $total = [int]$j.total }
      if ($j.updatedAt) { $serverAt = [string]$j.updatedAt }
    } catch { }
  }

  if ($total -le 0) { $total = 51664 }
  if ($pages -le 0 -and $total -gt 0) { $pages = [int][Math]::Ceiling($total / 100.0) }

  $pctArticles = if ($total -gt 0) { [Math]::Min(100, [int](100 * $saved / $total)) } else { 0 }
  $pctPages = if ($pages -gt 0) { [Math]::Min(100, [int](100 * $page / $pages)) } else { 0 }
  $pct = $pctArticles

  $eta = ""
  $now = Get-Date
  if ($null -ne $prevSaved -and $null -ne $prevAt -and $saved -gt $prevSaved) {
    $elapsed = ($now - $prevAt).TotalSeconds
    if ($elapsed -gt 0) {
      $rate = ($saved - $prevSaved) / $elapsed
      $left = $total - $saved
      if ($rate -gt 0 -and $left -gt 0) {
        $etaSec = [int]($left / $rate)
        $eta = "ETA ~$([int]($etaSec / 3600))h $([int](($etaSec % 3600) / 60))m ($([Math]::Round($rate * 60, 0)) statii/min)"
      }
    }
  }
  if ($saved -gt 0) { $prevSaved = $saved; $prevAt = $now }

  $fill = [int](36 * $pct / 100)
  $bar = ("#" * $fill).PadRight(36, "-")
  $st = if ($running) { "RUN" } else { "STOP" }
  $t = Get-Date -Format "HH:mm:ss"

  Write-Progress -Activity "Archive import" -Status "$saved / $total articles ($pct%)" -PercentComplete $pct
  Write-Host "[$t] $st  [$bar] $pct%   articles $saved / $total  (fail $fail)"
  Write-Host "      WP page $page / $pages ($pctPages%)  |  server json: $serverAt"
  if ($eta) { Write-Host "      $eta" -ForegroundColor Green }
  if ($logLine) { Write-Host "      $logLine" -ForegroundColor DarkGray }

  if (-not $running -and $saved -ge $total -and $total -gt 0) { break }
  Start-Sleep -Seconds $IntervalSec
}

Write-Progress -Activity "Archive import" -Completed
