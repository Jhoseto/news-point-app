#!/usr/bin/env bash
# Deploy or update both Cloud Run demo services.
# Attaches standard Secret Manager secrets every time (safe for first deploy and updates).
set -euo pipefail

: "${PROJECT_ID:?}"
: "${REGION:?}"
: "${AR_REPO:?}"
: "${WEB_SERVICE:?}"
: "${STUDIO_SERVICE:?}"
: "${IMAGE_TAG:?}"

WEB_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/web:${IMAGE_TAG}"
STUDIO_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/studio:${IMAGE_TAG}"

for REQUIRED in np-demo-database-url np-demo-database-url-session np-demo-studio-session-secret; do
  if ! gcloud secrets describe "${REQUIRED}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo "ERROR: Secret ${REQUIRED} missing in project ${PROJECT_ID}."
    echo "Cloud Shell: bash deploy/gcp-demo/scripts/gcp-bootstrap.sh ~/upload/.env.local"
    exit 1
  fi
done

SECRET_BINDINGS="DATABASE_URL=np-demo-database-url:latest,DATABASE_URL_SESSION=np-demo-database-url-session:latest,STUDIO_SESSION_SECRET=np-demo-studio-session-secret:latest"

common_run_flags=(
  --project="${PROJECT_ID}"
  --platform=managed
  --region="${REGION}"
  --port=8080
  --allow-unauthenticated
  --memory=1Gi
  --cpu=1
  --min-instances=0
  --max-instances=3
  --timeout=300
  --concurrency=80
  --set-secrets="${SECRET_BINDINGS}"
)

echo "=== Deploy Studio: ${STUDIO_SERVICE} ==="
gcloud run deploy "${STUDIO_SERVICE}" \
  "${common_run_flags[@]}" \
  --image="${STUDIO_IMAGE}" \
  --set-env-vars="NODE_ENV=production,STUDIO_PASSWORD_RESET_LOG=1"

echo "=== Deploy Web: ${WEB_SERVICE} ==="
gcloud run deploy "${WEB_SERVICE}" \
  "${common_run_flags[@]}" \
  --image="${WEB_IMAGE}" \
  --set-env-vars="NODE_ENV=production,WP_SOURCE_URL=https://newspoint.bg,POLL_TRUSTED_IP_HEADER=x-forwarded-for"

STUDIO_URL="$(gcloud run services describe "${STUDIO_SERVICE}" --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)')"
WEB_URL="$(gcloud run services describe "${WEB_SERVICE}" --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)')"
STUDIO_PUBLIC_URL="${WEB_URL%/}/admin"

echo "=== Sync public URLs ==="
gcloud run services update "${WEB_SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --update-env-vars="WEB_URL=${WEB_URL},STUDIO_URL=${STUDIO_URL},STUDIO_PUBLIC_URL=${STUDIO_PUBLIC_URL}"

gcloud run services update "${STUDIO_SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --update-env-vars="WEB_URL=${WEB_URL},STUDIO_URL=${STUDIO_URL},STUDIO_PUBLIC_URL=${STUDIO_PUBLIC_URL}"

echo ""
echo "Demo ready:"
echo "  Site:   ${WEB_URL}/"
echo "  Studio: ${STUDIO_PUBLIC_URL}/login/"
