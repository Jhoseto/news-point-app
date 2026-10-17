# Cloudflare cache rules — NP2 cutover (copy-paste)

Apply **only at cutover** after Apache serves NP2 on `@` / `www`. Until then, keep **Cache public WordPress pages** active.

Reference: [CLOUDFLARE.md](./CLOUDFLARE.md), [docs/CUTOVER_PLAN.md](../../docs/CUTOVER_PLAN.md).

## Disable at cutover

- **Cache public WordPress pages** (existing rule, order First)

## Rule 1 — Bypass NP2 dynamic and API (order: First)

**Action:** Bypass cache

**Custom filter expression:**

```
(
  starts_with(http.request.uri.path, "/api")
  or starts_with(http.request.uri.path, "/admin")
  or http.request.uri.path eq "/settings"
  or http.request.uri.path eq "/offline"
  or starts_with(http.request.uri.path, "/search")
  or starts_with(http.request.uri.path, "/_next/data")
  or any(http.request.headers["rsc"][*] eq "1")
  or any(http.request.headers["next-router-prefetch"][*] eq "1")
)
```

## Rule 2 — Next static (order: Second)

**Action:** Eligible for cache · Edge TTL: **Use cache-control header from origin**

**Expression:**

```
starts_with(http.request.uri.path, "/_next/static")
```

## Rule 3 — Public media (order: Third)

**Action:** Eligible for cache · Edge TTL: **Use cache-control header from origin**

**Expression:**

```
starts_with(http.request.uri.path, "/media/")
```

## After save

1. Caching → **Purge Everything**
2. Verify `curl -I https://newspoint.bg/api/live` → `cf-cache-status: DYNAMIC` or bypass (not HIT on HTML)
3. Verify static asset → may show HIT after second request
