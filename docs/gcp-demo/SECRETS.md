# Secrets и environment variables (GCP demo)

## Secret Manager (препоръчително)

| Secret ID | Env в Cloud Run | Задължително |
|-----------|-----------------|--------------|
| `np-demo-database-url` | `DATABASE_URL` | Да |
| `np-demo-studio-session-secret` | `STUDIO_SESSION_SECRET` | Да |
| `np-demo-supabase-url` | `SUPABASE_URL` | LivePoint photo upload |
| `np-demo-supabase-secret-key` | `SUPABASE_SECRET_KEY` | LivePoint photo upload |
| `np-demo-resend-api-key` | `RESEND_API_KEY` | Reset password mail |

Създаване (пример):

```bash
printf '%s' "$DATABASE_URL" | gcloud secrets create np-demo-database-url --data-file=-
```

Attach при deploy:

```text
--set-secrets=DATABASE_URL=np-demo-database-url:latest,STUDIO_SESSION_SECRET=np-demo-studio-session-secret:latest
```

## Plain environment (без secret)

| Variable | Service | Бележка |
|----------|---------|---------|
| `NODE_ENV` | both | `production` |
| `WEB_URL` | both | Cloud Run URL на web — **sync от deploy script** |
| `STUDIO_URL` | both | Cloud Run URL на studio (без `/admin`) |
| `STUDIO_PUBLIC_URL` | both | `{WEB_URL}/admin` |
| `WP_SOURCE_URL` | web | `https://newspoint.bg` |
| `POLL_TRUSTED_IP_HEADER` | web | `x-forwarded-for` за demo на Cloud Run |
| `STUDIO_PASSWORD_RESET_LOG` | studio | `1` докато няма Resend |
| `STUDIO_EMAIL_FROM` | studio | Валиден From за Resend |

Пълен списък локално: корен `.env.example`. За demo **не** са нужни `TEST_DATABASE_*`, worker sync, TomTom/Cesium (UI остава без live данни).

## Какво не commit-ваме

- Стойности в git
- `.env.local`
- `bootstrap-secrets.sh` с реални данни (ползвай само `.example`)
