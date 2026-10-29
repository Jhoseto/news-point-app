# Public article document cache

The deployment template remains **default-off**. Production was explicitly activated by the owner on 2026-10-27 after the canary below passed. Keep Studio at `/admin/`.

## Live state, 2026-10-27

- Worker `newspoint-article-cache`, compatibility date `2026-10-27`, `ENABLED=1`, `PUBLIC_ORIGIN=https://newspoint.bg`; workers.dev and preview URLs disabled. No credentials are in the Worker.
- Primary route `newspoint.bg/*`, **Fail open (proceed)**. More specific routes have no Worker: `/admin*`, `/api/*`, `/edge-article-cache/*`, `/_next/*`, `/media/*`, `/brand/*`, `/fonts/*`, `/moyat-plovdiv/*`, `/sw.js*`, `/manifest.webmanifest*`. These prefixes are on `newspoint.bg` only.
- The private server `.env.local` has the enabled flag and a token restricted to Cache Purge for this zone. It has no expiration. Do not copy its value into deployment files or reports. The app was built and released through the existing np2 deployment script; Web, Studio and the sync worker were restarted.
- Real desktop/mobile responses produced MISS → HIT. Invoking the existing authenticated revalidation endpoint returned `edgeCache: ok`; both variants then produced MISS → HIT again. Two further real articles from the homepage also produced MISS → HIT. Auth/unknown-cookie requests bypassed. Home, Studio login, static assets and the initial public SSE response passed.
- No article content was changed for this check: the production test exercised the same invalidation endpoint called by an editorial publication, rather than a Studio UI save. Evidence is in local ignored `tests/reports/article-edge-cache-20261027/`.
- Workers Free quota remains 100,000 invocations/day. Route exclusions reduce invocations; fail-open preserves the original site if the quota is exhausted. No paid plan was enabled. This is not proof of a 524 root-cause fix or a complete-user load benchmark.

Keep the safe template disabled for dry runs. An intentional future Worker deployment must preserve/reapply the live variables and route failure mode above. Normal app deployments preserve the server environment file.

## Behavior

- Only anonymous full HTML `GET` requests to canonical public article paths are candidates. The Worker maps them to `/edge-article-cache/v1/desktop/<article>/` or `/edge-article-cache/v1/mobile/<article>/`.
- The render endpoint requires production indexing, the explicit server flag, loopback rendering and configured purge credentials. It checks the public database query, refuses category routes/aliases, and renders with a fixed viewport cookie and no caller credentials. It verifies the public article marker, status, MIME type, size and robots headers before returning cacheable HTML.
- Cloudflare's native `fetch` cache uses the actual render URL and its `s-maxage=30`. It provides request collapsing and can use the existing Tiered Cache. No custom Worker cache key or Cache API cache is used. Successful responses do **not** force a TTL over `private`/`no-store`; redirects and errors are not cached.
- The canonical browser response stays `private, no-store`, with its original canonical URL and article metadata. The internal render URL is `noindex`. Cache source is exposed as `X-NP-Article-Cache` (`HIT`, `MISS`, etc. from the subrequest), not necessarily the outer `CF-Cache-Status`.
- Auth/unknown cookies, authorization, preview or unknown query parameters, RSC/router/prefetch requests, bots, non-GET methods and private/system paths use the original site. Only the known viewport and Cloudflare challenge cookies are accepted; cookie values are never forwarded into the cached render. Known tracking parameters are removed from the fill URL while the browser retains its original address.
- Existing revalidation invalidates pending renders and purges both real render URLs globally. Publication, visibility changes and deletion use that path. Purge failure is reported as an error; the hard TTL bounds remaining freshness to 30 seconds. Browser caches cannot retain a copy. There is no stale-on-error extension.

This reduces document-render load. It does not cache RSC navigation, APIs or SSE, or remove the reader live connection. Do not describe it as a benchmark of 1000 complete concurrent browsing sessions.

## Server configuration

All values belong in the existing private server `.env.local`, never in the Worker or a public bundle:

```dotenv
NP_ARTICLE_EDGE_CACHE=0
CLOUDFLARE_CACHE_ZONE_ID=
CLOUDFLARE_CACHE_PURGE_TOKEN=
```

Activation also requires the existing production `WEB_URL`, `NP_PUBLIC_INDEXING=1` and `REVALIDATE_INTERNAL_URL=http://127.0.0.1:3100` (use the actual local Web port). The token needs **Cache Purge for this zone only**. When enabled, revalidation allows up to 8 seconds for Next invalidation and the provider call. Restart the Web/Studio/worker processes using the approved deployment procedure so they share the configuration.

## Build and validation

From the repository root:

```powershell
pnpm exec tsc -p deploy/cloudflare/tsconfig.json
$articleWorkerOutput = Join-Path (Get-Location) 'tests/reports/article-edge-cache-20261027/worker-dist'
pnpm dlx wrangler@4.153.0 deploy --dry-run --config deploy/cloudflare/wrangler.jsonc --outdir $articleWorkerOutput
```

The pinned CLI was verified against the official npm registry on 2026-10-27. `wrangler.jsonc` keeps the production `newspoint.bg/*` route and observability configuration explicit, has `ENABLED=0` as its safe source default, and has no workers.dev endpoint. Production deploys must pass `ENABLED=1` deliberately. A dry run compiles locally and does not publish.

Tests cover credential/viewport/RSC/query isolation, public-only rendering, missing/hidden content, pending-render invalidation, both purge URLs, provider failure and 1000 **isolated simultaneous fill calls** sharing one render. Local production Next checks use a real published article read-only through the SSH tunnel; they do not prove a live Cloudflare HIT or a live global purge.

## Authorized activation

1. Review traffic and the Workers account plan before binding a route. Workers Free currently permits 100,000 invocations/day and 10ms CPU per request. Even bypassed requests count if they invoke the Worker. Do not provision a paid plan automatically.
2. Deploy the app with the server feature still disabled; confirm normal site, Studio and private responses. Configure and validate the zone-scoped purge token, then enable the server flag and restart the services. Test a published article's two render URLs: status200, public `s-maxage=30`, no `Set-Cookie`, `noindex`, correct viewport and canonical. Private/query-bearing fills must remain non-cacheable.
3. Deploy the Worker disabled. First bind/enable it for **one explicitly chosen existing article path**, keeping the public hostname. Configure route-limit failure behavior to **fail open** so the original site handles traffic if the Worker quota is exhausted. Verify the actual account settings; this configuration file does not claim to set that dashboard option.
4. Use ordinary full-page GETs with `Accept: text/html`, a browser User-Agent, and `np-viewport=desktop` / `mobile`. Expect a subsequent `X-NP-Article-Cache: HIT` per representation. `curl -I`, bots, authenticated sessions and RSC requests deliberately bypass. Verify the real Cloudflare cache and purge behavior before expanding the route.
5. Purge the two render URLs through the authorized revalidation path and verify a fresh fill. Editing real content is not required to test purge. Review the existing Cache Rules and verify they do not prevent the sanitized subrequest from caching. Keep private/API bypass rules.
6. Expand only after that canary passes. Exclude static/media/fonts/brand, `/api/*`, `/admin*`, internal render paths and other non-document routes from Worker invocation where route exclusions are available. Record the routes, quotas, baseline and rollback evidence in `docs/PLAN.md`.

Production release, route changes and credential creation require the owner's concrete instruction. No permission to change HTTP/2 or the legacy sites is implied.

## Rollback

Disable/remove the Worker route first (or set its `ENABLED=0`): canonical requests immediately use the original Next site. Then disable the server flag/restart as appropriate. Existing render copies expire after 30 seconds; purge their URLs if immediate invalidation is needed. Do not stop unrelated websites or alter HTTP/2 as part of this rollback.

Primary references checked: [native fetch cache and purging](https://developers.cloudflare.com/workers/reference/how-the-cache-works/), [request cache options](https://developers.cloudflare.com/workers/runtime-apis/request/), [single-file purge](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-single-file/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/). Route Handler behavior was also checked against the bundled Next16.3.8 documentation.

## City source relay

`newspoint-city-source-relay` is a separate `workers.dev` Worker used only as a signed read-only fallback for the public Lo/Hi programme. It has no `newspoint.bg` route and does not share article-cache behavior. The production collector first requests Lo/Hi directly and uses the relay only after the observed HTTP 202 response. The Worker accepts only `GET /city-source-relay/v1`, requires a five-minute HMAC-SHA256 signature, follows at most three same-host HTTPS redirects, allows only `www.lohicraftspace.com`, caps responses at 4MB and returns `private, no-store`. Unknown paths return404; unsigned requests return403.

The same secret is stored only as a Cloudflare Worker secret and in the private server `.env.local`. `CITY_SOURCE_RELAY_URL` and `CITY_SOURCE_RELAY_SECRET` must never enter a client bundle or repository value. Tests are in `tests/edge/city-source-relay-worker.test.ts`. `wrangler.city-relay.jsonc` deploys only this isolated Worker.

Do not add `plovdiv.bg`, `ecomap.plovdiv.bg` or `dogshelter.plovdiv.bg` to the allowlist: production and Cloudflare egress both receive403 from those domains. They require official allowlisting or another explicitly approved provider. Do not use browser challenge execution or weaken the NewsPoint zone WAF as a workaround.

## Public static files and cookie bypass (28 October 2026)

The existing `NewsPoint private Studio API and cookie requests` Cache Rule
(`7ae738f475c04f528ffe232fc2da3de8`) remains a **Bypass cache** rule. Its expression
now comes from `static-cache-policy.mjs`: cookie-independent CSS/JS/fonts under
`/_next/static/` and `/admin/_next/static/`, font files under `/fonts/`, and image
extensions under `/media/news/` are excluded from this bypass. The path and
extension allowlist rejects traversal, backslashes and encoded routing. Other
paths retain the original bypass behavior, including cookie-bearing article
requests, Studio pages, APIs, search, preferences, profile files and service workers.

This is a bypass-matching change only. It does **not** force caching of HTML,
private/no-store responses, set new edge/browser TTLs, remove cookies, change cache
keys, or create another Worker. Default static caching respects origin headers.
Mutable brand files and podcast/profile paths are outside this exception. New
photo uploads already allocate a fresh UUID path; archive optimization adds
responsive siblings instead of replacing the original. Do not replace a cached
file in place without purging its exact public URL; a CDN purge cannot invalidate
copies already fresh in a visitor's browser.

Live verification found anonymous static HIT but cookie-bearing DYNAMIC before
the change. After saving and reopening the rule, CSS, JS, font, news image and
Studio JS returned HIT for anonymous, reader and synthetic staff-cookie profiles,
with identical SHA-256 body hashes and no Set-Cookie. Private paths remained
DYNAMIC. A limited purge of one real CSS URL and one real image produced
MISS → HIT without changing source files or article content.

Rollback: replace this rule's expression with `originalPrivateBypassExpression`
from `static-cache-policy.mjs`; keep Bypass cache and the other settings intact.
The change requires no application restart or paid service. The meaningful
boundary tests are in `scripts/static-cache-policy.test.ts`; private live evidence
is kept under the ignored `tests/reports/static-cache-20261028/` directory.
