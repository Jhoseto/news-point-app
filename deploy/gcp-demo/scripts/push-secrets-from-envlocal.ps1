# Reads repo-root .env.local and creates/updates GCP Secret Manager entries for demo deploy.
# Usage (after gcloud auth login):
#   gcloud config set project newspointtest
#   pwsh -File deploy/gcp-demo/scripts/push-secrets-from-envlocal.ps1

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "../../..")
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) { throw "Missing $envFile" }

$vars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { return }
  $vars[$Matches[1]] = $Matches[2].Trim()
}

function Get-Var([string]$name) {
  if (-not $vars.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($vars[$name])) {
    throw "Missing $name in .env.local"
  }
  return $vars[$name]
}

$map = @{
  "np-demo-database-url"           = Get-Var "DATABASE_URL"
  "np-demo-database-url-session"   = Get-Var "DATABASE_URL_SESSION"
  "np-demo-studio-session-secret"  = Get-Var "STUDIO_SESSION_SECRET"
}

$project = (gcloud config get-value project 2>$null).Trim()
if (-not $project) { throw "Run: gcloud config set project newspointtest" }

foreach ($entry in $map.GetEnumerator()) {
  $name = $entry.Key
  $value = $entry.Value
  $exists = $null -ne (gcloud secrets describe $name --project=$project 2>$null)
  if ($exists) {
    $value | gcloud secrets versions add $name --project=$project --data-file=-
    Write-Host "Updated secret: $name"
  } else {
    $value | gcloud secrets create $name --project=$project --data-file=-
    Write-Host "Created secret: $name"
  }
}

$num = (gcloud projects describe $project --format="value(projectNumber)").Trim()
$cb = "${num}@cloudbuild.gserviceaccount.com"
$run = "${num}-compute@developer.gserviceaccount.com"

foreach ($sa in @($cb, $run)) {
  foreach ($name in $map.Keys) {
    gcloud secrets add-iam-policy-binding $name `
      --project=$project `
      --member="serviceAccount:$sa" `
      --role="roles/secretmanager.secretAccessor" `
      --quiet 2>$null | Out-Null
  }
}

Write-Host "Done. Cloud Build SA: $cb"
Write-Host "Run Cloud Build trigger newspoint-demo-deploy"
