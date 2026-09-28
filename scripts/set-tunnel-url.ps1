param(
  [Parameter(Mandatory = $true)]
  [string]$PublicUrl
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$raw = $PublicUrl.Trim().TrimEnd("/")
if ($raw -notmatch "^https?://") {
  $raw = "https://$raw"
}
$web = $raw
$admin = "${raw}/admin"
$path = Join-Path $root ".env.tunnel"
$lines = @(
  "# Auto: Cloudflare demo tunnel (gitignored). Delete file for localhost-only."
  "WEB_URL=$web"
  "STUDIO_PUBLIC_URL=$admin"
)
Set-Content -Path $path -Value $lines -Encoding utf8
Write-Host ""
Write-Host "Zapisano .env.tunnel"
Write-Host ("  WEB_URL=" + $web)
Write-Host ("  STUDIO_PUBLIC_URL=" + $admin)
Write-Host ""
