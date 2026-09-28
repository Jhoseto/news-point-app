# GCP demo — стъпка по стъпка (за инвеститори)

Този документ е **единственият ред на работа**. Не ползвай „Cloud Run → Create service → Continuously deploy“ за целия проект — там се получава **един** контейнер, а NewsPoint иска **два** (сайт + Studio).

---

## Cursor browser: gstatic блокиран?

Ако в **вградения browser** на Cursor виждаш „failed to load JavaScript from www.gstatic.com“, Console **не работи** там. Отвори в **Chrome/Edge**:

`https://console.cloud.google.com/?project=newspointtest` → **Cloud Shell** → пусни:

`bash deploy/gcp-demo/scripts/cloudshell-setup-newspointtest.sh` (след clone на repo).

---

## С какво го правим? (Docker — да)

| Слой | Технология | Какво прави |
|------|------------|-------------|
| Код | GitHub repo | При push стартира build |
| Build | **Cloud Build** | Чете `deploy/gcp-demo/cloudbuild.yaml` |
| Образи | **Docker** (2 броя) | `deploy/gcp-demo/docker/web.Dockerfile` и `studio.Dockerfile` |
| Registry | **Artifact Registry** | Пази `web` и `studio` images |
| Runtime | **Cloud Run** (2 сервиза) | `newspoint-web-demo` + `newspoint-studio-demo` |
| База | **Supabase** (външна) | Същата `DATABASE_URL` като локално |
| Снимки | WordPress URL | Без нов storage в GCP |

**Поток при commit:**

```text
git push → Cloud Build trigger → docker build (web) → docker build (studio)
         → push images → gcloud run deploy (и двата) → sync URL env vars
```

Локален Docker **не е задължителен** — build-ът става в Google Cloud. Локален Docker е само ако искаш да тестваш образ преди push.

---

## Какво ти трябва преди да започнеш

- [ ] GCP акаунт и **Project ID** (пример: `newspoint-demo-123456`)
- [ ] Billing включен на проекта
- [ ] Repo в GitHub с **commit-нати** файлове `deploy/gcp-demo/` и `docs/gcp-demo/`
- [ ] Локален `.env.local` с работещи `DATABASE_URL` и `STUDIO_SESSION_SECRET` (≥ 32 символа)
- [ ] **Google Cloud Shell** (бутон „Activate Cloud Shell“ в Console) **или** инсталиран `gcloud` на PC

Запиши си (ползваме ги навсякъде):

```bash
export PROJECT_ID="ТВОЯ_PROJECT_ID"
export REGION="europe-west1"
export AR_REPO="newspoint-demo"
```

---

## Стъпка 1 — Избери проект в Console

1. Отвори https://console.cloud.google.com/
2. Горе избери проекта → запиши **Project ID** (не display name).

---

## Стъпка 2 — Включи API-тата

В **Cloud Shell** (или локален терминал с `gcloud auth login`):

```bash
gcloud config set project "${PROJECT_ID}"

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project="${PROJECT_ID}"
```

Изчакай съобщение, че услугите са enabled.

---

## Стъпка 3 — Artifact Registry (място за Docker images)

```bash
gcloud artifacts repositories create "${AR_REPO}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --repository-format=docker \
  --description="NewsPoint temporary demo images"
```

Ако каже „already exists“ — продължи.

---

## Стъпка 4 — Права за Cloud Build

Cloud Build трябва да може да push-ва images и да deploy-ва Cloud Run:

```bash
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

for ROLE in roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${CB_SA}" \
    --role="${ROLE}" \
    --quiet
done
```

---

## Стъпка 5 — Secrets (Secret Manager)

Приложението **няма да тръгне** без тези два secret-а.

### Вариант A — Cloud Shell (copy-paste)

На **твоя PC** отвори `.env.local` и копирай стойностите. В Cloud Shell **не paste-вай secret-ите в историята на чата** — ползвай:

```bash
# DATABASE_URL — transaction pooler port 6543 от Supabase
read -s DBURL && printf '%s' "$DBURL" | gcloud secrets create np-demo-database-url \
  --project="${PROJECT_ID}" --data-file=- 2>/dev/null \
  || printf '%s' "$DBURL" | gcloud secrets versions add np-demo-database-url --data-file=-

# STUDIO_SESSION_SECRET — поне 32 символа
read -s SESS && printf '%s' "$SESS" | gcloud secrets create np-demo-studio-session-secret \
  --project="${PROJECT_ID}" --data-file=- 2>/dev/null \
  || printf '%s' "$SESS" | gcloud secrets versions add np-demo-studio-session-secret --data-file=-
```

(След `read -s` натисни Enter, paste, Enter — символите не се виждат.)

### Вариант B — Console UI

1. **Security → Secret Manager → Create secret**
2. Name: `np-demo-database-url` → Secret value: целият `DATABASE_URL` от `.env.local`
3. Repeat: `np-demo-studio-session-secret` → `STUDIO_SESSION_SECRET`

---

## Стъпка 6 — Cloud Run да може да чете secrets

```bash
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet
```

---

## Стъпка 7 — Свържи GitHub (Developer Connect)

1. Console → **Cloud Build** → **Repositories** (или **Developer Connect**)
2. **Link repository** / **Connect host** → **GitHub**
3. Авторизирай Google Cloud за организацията/акаунта
4. Избери repo: `news-point-app` (или както се казва при теб)
5. Завърши wizard-а — repo трябва да се вижда като **Connected**

**Не** създавай отделен Cloud Run service от „Create service“ с continuous deploy — ще дублираш и ще имаш само един Dockerfile.

---

## Стъпка 8 — Cloud Build trigger (автоматичен deploy)

1. **Cloud Build → Triggers → Create trigger**
2. Попълни:
   - **Name:** `newspoint-demo-deploy`
   - **Region:** global (default за triggers) или както предлага UI
   - **Event:** Push to a branch
   - **Source:** свързания GitHub repo
   - **Branch:** `^main$` (или твоят branch)
   - **Configuration:** Cloud Build configuration file (yaml or json)
   - **Location:** Repository
   - **Cloud Build configuration file location:** `deploy/gcp-demo/cloudbuild.yaml`
3. **Create**

Substitution variables (ако UI ги показва) — optional, defaults в yaml са OK:

| Variable | Default |
|----------|---------|
| `_REGION` | `europe-west1` |
| `_AR_REPO` | `newspoint-demo` |
| `_WEB_SERVICE` | `newspoint-web-demo` |
| `_STUDIO_SERVICE` | `newspoint-studio-demo` |

---

## Стъпка 9 — Studio потребител (ако още нямаш)

На локалния PC, с **същата** Supabase база:

```bash
pnpm studio:user
```

Запомни имейл/парола за login на demo.

---

## Стъпка 10 — Първи deploy (push или Run trigger)

1. Commit + push на branch-а от trigger-а (напр. `main`), **ако** gcp-demo файловете вече са в remote.
2. **Cloud Build → History** → отвори последния build → гледай логовете.

Успешен build завършва с:

```text
Demo ready:
  Site:   https://newspoint-web-demo-....run.app/
  Studio: https://newspoint-web-demo-....run.app/admin/login/
```

Ако build fail-не на `docker build` — отвори log step `build-web` / `build-studio`.

Ако fail-не на deploy със secret — върни се на **стъпка 5 и 6**.

**Ръчно пускане без push:** Triggers → ⋮ → **Run** на `newspoint-demo-deploy`.

---

## Стъпка 11 — Проверка в браузър

1. Отвори **Site URL** `/` — начало с реални статии
2. Отвори **Studio URL** `/admin/login/` — login с потребителя от стъпка 9
3. Светла/тъмна тема, една статия, по желание `/admin/`

Demo е с `noindex` — нормално за investor preview.

---

## Стъпка 12 — Следващи commit-и

Всеки push към branch-а → нов build → нови Docker tags → Cloud Run update.

Secrets и env (освен auto-sync URL) остават на сервиза. **Не** трябва отново Cloud Run wizard.

---

## Екранът „Create Cloud Run service“ — какво да правиш

| Ако виждаш… | Действие |
|-------------|----------|
| Continuous deploy + Developer Connect | OK **само** за стъпка 7 (свързване на repo) |
| Service name / Region / Auth на Create service | **Пропусни** — trigger + `cloudbuild.yaml` създават двата сервиза |
| Ingress All + Public access | Това deploy script-ът задава автоматично |

---

## Чести грешки

| Проблем | Решение |
|---------|---------|
| Build OK, app 500 | Secret `np-demo-database-url` грешен или липсва pooler `:6543` |
| `/admin` 502 | Studio service down — Cloud Run → `newspoint-studio-demo` → Logs |
| Login redirect loop | В Logs на studio: провери `STUDIO_PUBLIC_URL` = `https://WEB_HOST/admin` |
| Secret permission denied | Повтори стъпка 6 |
| Trigger не се пуска | Branch regex vs реален branch; файловете в remote? |

---

## Премахване след demo

[REMOVAL.md](./REMOVAL.md)
