# Настройка: GCP demo (reference)

> **Първи път?** Ползвай **[WALKTHROUGH-BG.md](./WALKTHROUGH-BG.md)** — там е редът стъпка по стъпка и обяснение за Docker / Cloud Build / Cloud Run.

Този файл е кратък cheat sheet с команди. Замени `PROJECT_ID`, `REGION` и имената на сервизите, ако промениш substitutions в `deploy/gcp-demo/cloudbuild.yaml`.

## 1. GCP проект

1. [Google Cloud Console](https://console.cloud.google.com/) → нов или съществуващ проект.
2. Запиши **Project ID** (не display name).
3. Enable APIs:
   ```bash
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com --project=PROJECT_ID
   ```

## 2. Artifact Registry

```bash
export PROJECT_ID=your-project
export REGION=europe-west1
export AR_REPO=newspoint-demo

gcloud artifacts repositories create "${AR_REPO}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --repository-format=docker
```

## 3. Secrets (Secret Manager)

От локален `.env.local` (стойности **не** commit-вай):

```bash
export GCP_PROJECT_ID="${PROJECT_ID}"
# зареди DATABASE_URL, STUDIO_SESSION_SECRET, ...
bash deploy/gcp-demo/scripts/bootstrap-secrets.example.sh
```

Или ръчно — виж [SECRETS.md](./SECRETS.md).

## 4. IAM за Cloud Build

Cloud Build service account (по подразбиране `PROJECT_NUMBER@cloudbuild.gserviceaccount.com`):

```bash
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

for ROLE in roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${CB_SA}" \
    --role="${ROLE}"
done
```

## 5. Runtime service account + достъп до secrets

Cloud Run по подразбиране ползва compute default SA. Дай му четене на secrets:

```bash
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

## 6. Първи deploy (с secrets)

Build локално или изчакай Cloud Build. Пример с вече build-нат image след първи trigger, или локално:

```bash
# от root на repo
export PROJECT_ID REGION AR_REPO
docker build -f deploy/gcp-demo/docker/studio.Dockerfile -t "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/studio:manual" .
docker build -f deploy/gcp-demo/docker/web.Dockerfile -t "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/web:manual" .
gcloud auth configure-docker "${REGION}-docker.pkg.dev"
docker push "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/studio:manual"
docker push "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/web:manual"
```

**Studio (първо):**

```bash
gcloud run deploy newspoint-studio-demo \
  --project="${PROJECT_ID}" \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/studio:manual" \
  --region="${REGION}" \
  --port=8080 \
  --allow-unauthenticated \
  --memory=1Gi \
  --set-secrets="DATABASE_URL=np-demo-database-url:latest,STUDIO_SESSION_SECRET=np-demo-studio-session-secret:latest" \
  --set-env-vars="NODE_ENV=production,STUDIO_PASSWORD_RESET_LOG=1"
```

**Web:**

```bash
STUDIO_URL=$(gcloud run services describe newspoint-studio-demo --region="${REGION}" --format='value(status.url)')

gcloud run deploy newspoint-web-demo \
  --project="${PROJECT_ID}" \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/web:manual" \
  --region="${REGION}" \
  --port=8080 \
  --allow-unauthenticated \
  --memory=1Gi \
  --set-secrets="DATABASE_URL=np-demo-database-url:latest,STUDIO_SESSION_SECRET=np-demo-studio-session-secret:latest" \
  --set-env-vars="NODE_ENV=production,STUDIO_URL=${STUDIO_URL},WP_SOURCE_URL=https://newspoint.bg,POLL_TRUSTED_IP_HEADER=x-forwarded-for"
```

**Синхронизирай публичните URL-и** (или пусни deploy script след следващ CI build):

```bash
export PROJECT_ID REGION WEB_SERVICE=newspoint-web-demo STUDIO_SERVICE=newspoint-studio-demo AR_REPO IMAGE_TAG=manual
bash deploy/gcp-demo/scripts/deploy-cloudrun.sh
```

Отвори `WEB_URL/` и `WEB_URL/admin/login/`.

## 7. Cloud Build ↔ GitHub (автоматичен deploy при commit)

1. Console → **Cloud Build** → **Repositories** → Connect GitHub repo.
2. **Triggers** → Create:
   - Event: Push to branch (напр. `main`)
   - Configuration: Cloud Build configuration file
   - Location: `deploy/gcp-demo/cloudbuild.yaml`
3. Push commit → провери build log.

След първия успешен deploy с secrets, **следващите** build-ове само сменят image; env/secrets на Cloud Run остават.

## 8. (По избор) GitHub Actions

Ако предпочиташ Actions вместо Cloud Build trigger: виж коментарите в `.github/workflows/gcp-demo-deploy.yml` (WIF + secrets).

## 9. Studio потребител

Локално срещу **същата** Supabase база:

```bash
pnpm studio:user
```

## Чести проблеми

| Симптом | Причина |
|---------|---------|
| 502 на `/admin` | `STUDIO_URL` на web service грешен или studio не стартира |
| Auth грешка | `STUDIO_PUBLIC_URL` трябва да е `https://<web-host>/admin` |
| DB connection | Pooler URL 6543 + `prepare: false` (както в `.env.example`) |
| Cold start 10–30 s | Задай `--min-instances=1` на двата сервиза (по-скъпо) |
