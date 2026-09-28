#!/usr/bin/env bash
# One Cloud Shell run: APIs + Artifact Registry + IAM (+ optional secrets from .env.local).
#   gcloud config set project newspointtest
#   bash deploy/gcp-demo/scripts/gcp-bootstrap.sh
#   bash deploy/gcp-demo/scripts/gcp-bootstrap.sh ~/upload/.env.local
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-europe-west3}"
AR_REPO="${GCP_AR_REPO:-newspoint-demo}"
ENV_FILE="${1:-}"

echo "Project=${PROJECT_ID} Region=${REGION} Repo=${AR_REPO}"

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project="${PROJECT_ID}"

if ! gcloud artifacts repositories describe "${AR_REPO}" --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${AR_REPO}" \
    --location="${REGION}" \
    --repository-format=docker \
    --project="${PROJECT_ID}" \
    --description="NewsPoint demo"
  echo "Created Artifact Registry: ${AR_REPO}"
else
  echo "Artifact Registry exists: ${AR_REPO}"
fi

PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for ROLE in roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${CB_SA}" \
    --role="${ROLE}" \
    --condition=None \
    --quiet >/dev/null 2>&1 || true
done

if [[ -n "${ENV_FILE}" && -f "${ENV_FILE}" ]]; then
  bash "$(dirname "$0")/push-secrets-from-envlocal.sh" "${ENV_FILE}"
else
  echo ""
  echo "Secrets skipped. Upload .env.local then run:"
  echo "  bash deploy/gcp-demo/scripts/gcp-bootstrap.sh ~/upload/.env.local"
fi

echo ""
echo "Next: Cloud Build → Triggers → newspoint-demo-deploy → Run"
echo "  Revision: Branch main (NOT an old commit hash)"
echo "  Config: cloudbuild.yaml at repo root (commit 3458ebc or newer)"
