# NewsPoint origin and domain preparation

These files prepare a release; they do not configure Cloudflare, change DNS or apply Apache settings. A concrete production release remains an explicit operator action. Keep the old WordPress virtual host/account outside this configuration.

## HTTPS ingress

`render-ingress.mjs` validates the server `.env.local` WEB_URL as an HTTPS origin and renders the np2 `.htaccess`. The starter prepares it before stopping processes, then installs it only in np2/public_html as part of the authorized restart. All HTTP requests and alternate Host values redirect to the fixed WEB_URL HTTPS host before proxying, including Studio. Forwarded scheme/host/IP headers are overwritten rather than trusted from the caller.

The origin Apache must terminate TLS. Use Cloudflare **Full (strict)** with a valid origin certificate; Flexible mode is incompatible and may loop. Before a release, have the hosting administrator confirm this prerequisite. If TLS terminates at another load balancer, this configuration must be adapted at that trusted boundary first, not by accepting arbitrary X-Forwarded-Proto.

`cloudflare-origin.conf.example` contains the np2-only virtual-host real-IP preparation. Its trusted proxy file must be populated with current IPv4 and IPv6 ranges from Cloudflare's official list. Apache mod_remoteip must be enabled, the file must be nonempty, and direct origin access must be restricted. Do not trust CF-Connecting-IP globally or without the trusted list. Without this setup the generated X-Real-IP remains the socket peer and users can share rate limits; it does not become a spoofable browser header.

## Public indexing

Default `NP_PUBLIC_INDEXING=0` is fail-closed. Preview hosting/tunnel/local/IP origins stay noindex even with an accidental opt-in. For the approved real domain, set production WEB_URL to its HTTPS origin, align STUDIO_PUBLIC_URL to WEB_URL/admin, configure the origin certificate and set NP_PUBLIC_INDEXING=1 **before building**. Rebuild/restart is required because Next header rules and static metadata are deployment artifacts. Search/settings/offline/archive/API/Studio/draft paths keep noindex.

Canonical URLs, sitemap/robots, RSS and share metadata derive from WEB_URL. Keep previews in a separate deployment with indexing off; redirect old preview/alternate domain traffic to the canonical production host at ingress. Do not merely remove the HTML meta tag: HTTP X-Robots-Tag and cached responses must agree.

## Edge cache defaults

Do not enable a blanket Cache Everything rule for HTML. Keep origin private/no-store for dynamic reader HTML and bypass `/admin`, authenticated responses, `/api`, drafts and personal settings. Cache immutable static assets and public media according to their existing headers. Service worker and VAPID endpoints must retain no-store/no-cache behavior.

If custom HTML caching is added later, its normalized key must respect effective mobile/desktop shell (cookie, client hints and UA fallback), document versus RSC/navigation responses, query parameters and content invalidation. `Vary` alone is not proof of correct Cloudflare key behavior. Test independent desktop/mobile/authenticated sessions before enabling.

## Release verification after an explicitly authorized apply

- Clean client without remembered HSTS: HTTP home/article/Studio return301/308 to HTTPS; a forged X-Forwarded-Proto does not bypass the redirect. HTTPS does not loop and the alternate www hostname redirects to the selected canonical host.
- Login and protected endpoints work over HTTPS; cookies retain Secure/HttpOnly; unauthorized API remains401/no-store. Do not send credentials over HTTP to test.
- Header and HTML robots agree on public pages; preview/Studio/404/private paths remain excluded. Sitemap children, canonical, JSON-LD, RSS/share URLs use the real domain, not preview/localhost. Purge obsolete indexing headers from edge caches after the launch configuration changes.
- Verify trusted client IP using two real clients without exposing addresses in public logs; browser-supplied X-Real-IP/X-Forwarded-For do not control the result.
- Public live endpoint delivers initial data and20-second heartbeats; media Range requests return206; static asset cache HIT does not turn Studio/API into shared-cache responses. Check actual upload chunk limits/timeouts from the separate media implementation.

Primary references checked for this change: [Apache TLS rewrite variables](https://httpd.apache.org/docs/2.4/mod/mod_rewrite.html), [request header overwrite](https://httpd.apache.org/docs/2.4/mod/mod_headers.html), [trusted proxy IP handling](https://httpd.apache.org/docs/2.4/mod/mod_remoteip.html), [Cloudflare Full(strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/), [Cloudflare default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/).
