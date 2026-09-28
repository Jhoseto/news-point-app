#!/usr/bin/env bash
# One-shot GCP demo setup for project newspointtest (Cloud Shell).
# Usage: open https://console.cloud.google.com/?project=newspointtest in Chrome → Cloud Shell → paste:
#   curl -sSL "https://raw.githubusercontent.com/Jhoseto/news-point-app/main/deploy/gcp-demo/scripts/cloudshell-setup-newspointtest.sh" | bash
# Or clone repo and: bash deploy/gcp-demo/scripts/cloudshell-setup-newspointtest.sh
#
# Secrets: script prompts for DATABASE_URL and STUDIO_SESSION_SECRET (not echoed).

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-newspointtest}"
REGION="${REGION:-europe-west1}"
AR_REPO="${AR_REPO:-newspoint-demo}"
WEB_SERVICE="${WEB_SERVICE:-newspoint-web-demo}"
STUDIO_SERVICE="${STUDIO_SERVICE:-newspoint-studio-demo}"
GITHUB_OWNER="${GITHUB_OWNER:-Jhoseto}"
GITHUB_REPO="${GITHUB_REPO:-news-point-app}"
BRANCH="${BRANCH:-main}"

echo "=== Project ${PROJECT_ID} / ${REGION} ==="
gcloud config set project "${PROJECT_ID}"

echo "=== Enable APIs ==="
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project="${PROJECT_ID}"

echo "=== Artifact Registry ==="
if ! gcloud artifacts repositories describe "${AR_REPO}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${AR_REPO}" \
    --location="${REGION}" \
    --repository-format=docker \
    --description="NewsPoint temporary demo"
fi

echo "=== IAM: Cloud Build ==="
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for ROLE in roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${CB_SA}" \
    --role="${ROLE}" \
    --quiet >/dev/null
done
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet >/dev/null

echo "=== Secrets (paste from .env.local; input hidden) ==="
if ! gcloud secrets describe np-demo-database-url --project="${PROJECT_ID}" >/dev/null 2>&1; then
  read -rsp "DATABASE_URL (Supabase pooler :6543): " DBURL
  echo
  printf '%s' "${DBURL}" | gcloud secrets create np-demo-database-url --data-file=-
else
  echo "np-demo-database-url exists — skip or: gcloud secrets versions add np-demo-database-url --data-file=-"
fi
if ! gcloud secrets describe np-demo-studio-session-secret --project="${PROJECT_ID}" >/dev/null 2>&1; then
  read -rsp "STUDIO_SESSION_SECRET (>=32 chars): " SESS
  echo
  printf '%s' "${SESS}" | gcloud secrets create np-demo-studio-session-secret --data-file=-
else
  echo "np-demo-studio-session-secret exists"
fi

echo "=== Cloud Build trigger (requires connected GitHub repo) ==="
TRIGGER_NAME="newspoint-demo-deploy"
if gcloud builds triggers describe "${TRIGGER_NAME}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Trigger ${TRIGGER_NAME} already exists"
else
  echo "If GitHub is NOT connected yet, do: Console → Cloud Build → Repositories → Connect, then re-run from here:"
  gcloud builds triggers create github \
    --name="${TRIGGER_NAME}" \
    --repo-name="${GITHUB_REPO}" \
    --repo-owner="${GITHUB_OWNER}" \
    --branch-pattern="^${BRANCH}$" \
    --build-config="deploy/gcp-demo/cloudbuild.yaml" \
    --project="${PROJECT_ID}" \
    || echo ">>> Connect GitHub first (Cloud Build → Repositories), then run trigger create manually — see docs/gcp-demo/WALKTHROUGH-BG.md step 8"
fi

echo ""
echo "=== Done (infra). Next: ==="
echo "1) Push code with deploy/gcp-demo/ to GitHub branch ${BRANCH}"
echo "2) Cloud Build → Triggers → Run ${TRIGGER_NAME}  (or push commit)"
echo "3) Open Cloud Run URLs from build log (Site + /admin/login/)"
echo "4) Local: pnpm studio:user  (same Supabase DB)"
