#!/usr/bin/env bash
# ONE-TIME helper: create Secret Manager entries from your local .env.local (never commit this file with real values).
# Copy to bootstrap-secrets.sh, fill paths, run once. See docs/gcp-demo/SETUP.md
#
# Usage (after copying and editing):
#   set -a && source ../../.env.local && set +a
#   bash deploy/gcp-demo/scripts/bootstrap-secrets.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"

create_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "${name}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo "exists: ${name}"
  else
    printf '%s' "${value}" | gcloud secrets create "${name}" --project="${PROJECT_ID}" --data-file=-
    echo "created: ${name}"
  fi
}

create_secret np-demo-database-url "${DATABASE_URL:?}"
create_secret np-demo-studio-session-secret "${STUDIO_SESSION_SECRET:?}"

# Optional but recommended for full demo:
if [[ -n "${SUPABASE_URL:-}" ]]; then create_secret np-demo-supabase-url "${SUPABASE_URL}"; fi
if [[ -n "${SUPABASE_SECRET_KEY:-}" ]]; then create_secret np-demo-supabase-secret-key "${SUPABASE_SECRET_KEY}"; fi
if [[ -n "${RESEND_API_KEY:-}" ]]; then create_secret np-demo-resend-api-key "${RESEND_API_KEY}"; fi

echo "Done. Attach secrets to Cloud Run with docs/gcp-demo/cloudrun-env.example.yaml"
