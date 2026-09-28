# Премахване на временния GCP demo

Когато production отиде на финалния сървър/домейн:

## 1. Спри автоматичния deploy

- Cloud Build → изтрий trigger-а за `deploy/gcp-demo/cloudbuild.yaml`
- Или disable `.github/workflows/gcp-demo-deploy.yml` (изтрий файла в commit)

## 2. Изтрий Cloud Run сервизите

```bash
gcloud run services delete newspoint-web-demo --region=europe-west1 --quiet
gcloud run services delete newspoint-studio-demo --region=europe-west1 --quiet
```

## 3. (По избор) Artifact Registry и images

```bash
gcloud artifacts repositories delete newspoint-demo --location=europe-west1 --quiet
```

## 4. (По избор) Secrets

```bash
gcloud secrets delete np-demo-database-url --quiet
# ... останалите np-demo-*
```

## 5. Премахни файловете от repo (един commit)

```text
deploy/gcp-demo/
docs/gcp-demo/
.github/workflows/gcp-demo-deploy.yml
.dockerignore
```

## 6. Отмени Docker-only промени в Next config (ако вече не са нужни)

В `apps/web/next.config.ts` и `apps/studio/next.config.ts` махни блока:

```ts
...(process.env.NP_DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
```

Локалната разработка не го изисква.

## 7. GCP проект

Ако demo проектът е само за това — архивирай или изтрий целия GCP project от Console.
