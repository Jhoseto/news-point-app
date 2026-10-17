# Apache cutover — newspoint.bg → np2 (operator)

**Prerequisite:** backup current vhost config for the WordPress `newspoint.bg` / `www` host.

**Do not** change DNS in Cloudflare. Same IP; only Apache routing changes.

## Target state

- Public hostnames `newspoint.bg` and `www.newspoint.bg` proxy to np2 `127.0.0.1:3100` (web) with Studio on `:3101` via existing np2 routing.
- np2 account already has `~/public_html/.htaccess` proxying to `:3100` when that vhost receives traffic.

## np2 ingress (regenerate before flip)

On server as `np2`, with production `.env.local` (`WEB_URL=https://newspoint.bg`):

```bash
node ~/newspoint-app/deploy/np2/render-ingress.mjs ~/newspoint-app/.env.local > ~/newspoint-app/logs/ingress.htaccess.next
# Review diff, then install on authorized restart:
# cp to ~/public_html/.htaccess via start-newspoint.sh / remote-deploy
```

Generated ingress includes HTTPS redirect to canonical host, overwritten `X-Forwarded-*` / `X-Real-IP`, and proxy to `:3100`.

**Gap found 2026-10-17:** live `~/public_html/.htaccess` on np2 was a **short** variant (proxy + X-Real-IP only, no HTTPS/host redirect block). Regenerate from `render-ingress.mjs` before go-live.

## Flip (spanel / root)

1. Edit primary vhost for `newspoint.bg` / `www` so document root / proxy targets **np2** `public_html` (or equivalent reverse proxy to `127.0.0.1:3100`), not the WordPress account docroot.
2. `apachectl configtest && systemctl reload apache2` (or host panel equivalent).
3. Smoke: `https://newspoint.bg/` returns Next.js (`X-Powered-By: Next.js`), not `x-powered-by: PHP`.

## Rollback (< 5 min)

1. Restore saved WordPress vhost snippet.
2. Reload Apache.
3. Cloudflare: re-enable **Cache public WordPress pages** if it was disabled; purge cache.

WordPress files stay on disk; only routing reverts.

## Origin hardening (can be done before flip on np2 vhost)

- [cloudflare-origin.conf.example](./cloudflare-origin.conf.example)
- [cloudflare-proxies.txt.example](./cloudflare-proxies.txt.example) → server path referenced in Apache config
