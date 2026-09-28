#!/usr/bin/env bash
# Reads .env.local and creates GCP secrets + IAM for Cloud Build and Cloud Run.
# Cloud Shell: Upload .env.local (⋮ menu), then:
#   bash deploy/gcp-demo/scripts/push-secrets-from-envlocal.sh ~/upload/.env.local
set -euo pipefail

ENV_FILE="${1:-$(dirname "$0")/../../../.env.local}"
ENV_FILE="$(cd "$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE"; exit 1; }

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
[[ -n "$PROJECT_ID" ]] || { echo "gcloud config set project newspointtest"; exit 1; }

read_var() {
  grep -E "^${1}=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r'
}
DATABASE_URL="$(read_var DATABASE_URL)"
DATABASE_URL_SESSION="$(read_var DATABASE_URL_SESSION)"
STUDIO_SESSION_SECRET="$(read_var STUDIO_SESSION_SECRET)"
[[ -n "$DATABASE_URL" && -n "$DATABASE_URL_SESSION" && -n "$STUDIO_SESSION_SECRET" ]] || {
  echo "Missing DATABASE_URL, DATABASE_URL_SESSION or STUDIO_SESSION_SECRET in $ENV_FILE"
  exit 1
}

upsert_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --project="$PROJECT_ID" --data-file=-
    echo "Updated: $name"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --project="$PROJECT_ID" --data-file=-
    echo "Created: $name"
  fi
}

upsert_secret np-demo-database-url "$DATABASE_URL"
upsert_secret np-demo-database-url-session "$DATABASE_URL_SESSION"
upsert_secret np-demo-studio-session-secret "$STUDIO_SESSION_SECRET"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
for SA in "${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"; do
  for S in np-demo-database-url np-demo-database-url-session np-demo-studio-session-secret; do
    gcloud secrets add-iam-policy-binding "$S" \
      --project="$PROJECT_ID" \
      --member="serviceAccount:${SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --quiet >/dev/null || true
  done
done

echo "OK — secrets + IAM. Run Cloud Build trigger."
