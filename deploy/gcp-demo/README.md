# GCP demo deploy (temporary)

**Documentation:** [docs/gcp-demo/README.md](../../docs/gcp-demo/README.md)

- `docker/` — Cloud Run images (web + studio)
- `cloudbuild.yaml` — Cloud Build trigger config
- `scripts/deploy-cloudrun.sh` — deploy + URL sync (used by Cloud Build and GitHub Actions)
- `cloudrun-env.example.yaml` — reference for first `gcloud run deploy`
