# Cutover audit snapshot — 2026-10-17

Read-only checks unless noted. Secrets not recorded.

## SSH (`np2@95.217.114.220:6543`)

| Item | Status |
|------|--------|
| App dir | `/home/np2/newspoint-app` present |
| `.env.local` | present; `WEB_URL`, `STUDIO_PUBLIC_URL` set (values not logged) |
| `NP_PUBLIC_INDEXING` | not set in grep sample → treat as **0** / fail-closed until cutover |
| Node | `127.0.0.1:3100`, `:3101` listening |
| Processes | next-server ×2, worker running |
| np2 `.htaccess` | proxy to `:3100`; **missing** full `render-ingress.mjs` HTTPS/host/forwarded headers — regenerate before go-live |

Localhost smoke (`Host: newspoint.bg` → `:3100`): **200**, `X-Powered-By: Next.js`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store…`

## Public HTTP (live WordPress on `@`)

| URL | Result |
|-----|--------|
| `https://newspoint.bg/` | 200, `Server: cloudflare`, PHP/WP stack on origin |
| `https://www.newspoint.bg/` | 301 → apex, `x-redirect-by: WordPress` |

## Cloudflare (from dashboard screenshots + DNS)

- A `@`, `www`, `*` → `95.217.114.220` Proxied — **no DNS change at cutover**
- SSL: **Full** (target **Full strict** after origin cert)
- Cache: WP rule active (2 min edge, ignore origin CC) — swap per [deploy/np2/cloudflare-cache-rules.md](../deploy/np2/cloudflare-cache-rules.md)
- MCP/API audit: **blocked** — needs OAuth or logged-in Chrome remote debugging

## Database

- Migration **37** (`media_upload_sessions`): **already applied** on tunnel DB (2026-10-17)

## Analytics (WordPress → NP2)

- **GA4 account (confirmed 2026-10-17):** GoalsWins `93570231` · property **NewsPoint.bg - GA4** `422487136` (reuse — do not create a new property for NP2 cutover).
- **Measurement ID:** **`G-Z39FGHRFPP`** (NewsPoint.bg GA4 web stream). Set on server as `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Tag loads when `NP_PUBLIC_INDEXING=1` or `NP_PUBLIC_ANALYTICS=1`; requires **production rebuild** after env change (`NEXT_PUBLIC_*` is build-time).
- Live WP homepage: dns-prefetch to GTM/GA; ID may load via consent/delayed script — Tag Assistant on `newspoint.bg` if needed.
- NP2: `NEXT_PUBLIC_GA_MEASUREMENT_ID` or `NEXT_PUBLIC_GTM_ID` in server `.env.local`; tag loads with `NP_PUBLIC_INDEXING=1` (or `NP_PUBLIC_ANALYTICS=1` for preview). See `.env.example`.
- Dashboard recommends linking **Search Console** `sc-domain:newspoint.bg` — do after cutover + indexing; submit sitemap in GSC.

## Operator-only (not done by agent)

- Apache vhost flip → [deploy/np2/APACHE_FLIP.md](../deploy/np2/APACHE_FLIP.md)
- Cloudflare rule toggle + purge at cutover
- `NP_PUBLIC_INDEXING=1` rebuild + authorized deploy
