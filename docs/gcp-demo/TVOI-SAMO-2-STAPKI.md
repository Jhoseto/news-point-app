# GCP demo — само това зависи от теб

Кодът, `cloudbuild.yaml`, Docker и deploy script-ът са готови в GitHub (`main`).

## 1. Cloud Shell (един път, ~2 min)

1. [Console](https://console.cloud.google.com/?project=newspointtest) → **Cloud Shell**
2. **Upload** `.env.local` → обикновено `~/upload/.env.local`
3. Paste:

```bash
git clone https://github.com/Jhoseto/news-point-app.git
cd news-point-app
git pull
bash deploy/gcp-demo/scripts/gcp-bootstrap.sh ~/upload/.env.local
```

Чакай `OK — secrets + IAM`.

## 2. Cloud Build trigger

1. **Cloud Build → Triggers**
2. **Disable** стария trigger `rmgpgab-newspoint-...` (inline deploy към `newspoint`)
3. **`newspoint-demo-deploy` → Run**
   - **Branch:** `main` (не стар commit!)
   - В log-а трябва `HEAD is now at` с commit **3458ebc** или по-нов

Build ~15–25 min → в края: `Demo ready: Site: ...`

---

Ако deploy падне с „Secret missing“ — повтори стъпка 1 с upload на `.env.local`.

Пълен ред: [WALKTHROUGH-BG.md](./WALKTHROUGH-BG.md)
