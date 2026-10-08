# NewsPoint 2.0 — Performance sprint

08.10.2026. Само производителност. SEO архитектурата не се пипа (`docs/SEO_PLAN.md`).

Staging (преди deploy на тези промени): `https://site44159-izdo3c.scloudsite101.com/`  
Цел: mobile Lighthouse 90+ / desktop 95+, LCP ≤ 2.5s, CLS ≤ 0.1, TBT &lt; 200ms.

## Baseline (staging, преди deploy)

| Страница | UA | HTML download | TTFB |
|---|---|---:|---:|
| `/` | desktop CH | ~2.99 MB | ~0.28 s |
| `/` | mobile CH | ~2.99 MB | ~0.18 s |
| `/balgariya/` | mobile | ~0.78 MB | ~0.13 s |

Двете shell дървета (mobile + desktop) се сериализираха заедно в HTML → ~3 MB и ~14 `fetchPriority=high`.  
PageSpeed API квотата беше изчерпана; CrUX за временния домейн липсва. Лабораторните числа по-долу са от локален `next start` :3010 (media през `MEDIA_ORIGIN` rewrite — по-бавни от сървърен диск).

## След промените (локален production build)

| Страница | UA | HTML download | imgs | TTFB |
|---|---|---:|---:|---:|
| `/` | desktop | ~1.23 MB | ~274 | ~0.31 s |
| `/` | mobile | ~1.37 MB | ~183 | ~0.05 s |
| `/balgariya/` | mobile | ~0.32 MB | ~39 | ~0.87 s (cold) |

Lighthouse локално (`lighthouse@12.8.1`, headless Chrome), начало:

| | Mobile | Desktop |
|---|---:|---:|
| Performance | ~67 | ~81 |
| FCP | ~3.6 s | ~0.9 s |
| LCP | ~8.0 s* | ~2.7 s |
| SI | ~3.6 s | ~1.7 s |
| TBT | ~70 ms | ~0 ms |
| CLS | 0 | ~0.005 |
| TTFB (doc) | ~40 ms | ~50 ms |
| Total bytes | ~2.0 MB | ~6.4 MB |
| Responsive images savings | ~426 KiB (было ~1.3 MB) | още големи оригинали под сгъвката |

\*Мобилният LCP локално е доминиран от download на `/media/` през remote rewrite (~90% Load Time). На сървъра файловете са локални под `/home/np2/storage` — очаква се рязко по-нисък LCP след deploy. LCP елементът е mobile lead `<img>` с `fetchpriority=high` + `srcset` (card 960w + original).

## Поправени проблеми

1. **Двоен SSR shell (~3 MB HTML)** — `ssrDesktopViewport()` + early-return само на mobile или desktop дърво (`app/page.tsx`, `category-page.tsx`). `Accept-CH` / `Critical-CH` / `Vary`.
2. **`DYNAMIC_SERVER_USAGE` на рубрики** — махнат празен `generateStaticParams` от `[...path]` (несъвместим с `headers()`).
3. **Client boundary сериализираше целия feed** — `DesktopFeed` / `MobileFeedBoundary` вече не обвиват children в client component; само `ViewportShellGate`.
4. **Carousel clone ×2 в SSR** — вторият сет се монтира след hydration.
5. **Lite/srcset** — compact srcset (≤2 ширини); lite карти ползват малък variant като `src`; LCP `src` предпочита ≤960w variant.
6. **Pager JSON** — `serializeFeedArticle` пази ≤2 variant-а, без caption/credit.
7. **Logo LCP шум** — dark twin и non-header логота са `fetchPriority=low`.

## Ограничения (остават)

- Homepage още е тежък (~1.2–1.4 MB HTML): много секции + client carousels/polls.
- Много `use client` в chrome (LivePoint, push, podcast) — TBT вече е нисък лабораторно; field INP ще се мери след Cloudflare + реален трафик.
- Липсват WebP/AVIF производни за част от архива → Lighthouse „responsive images“ остава.
- Без deploy тези оптимизации не са на staging.
- PSI API quota; няма CrUX за временния домейн.

## Cloudflare (за `newspoint.bg` при миграция)

**Включвай:** HTTP/3, Brotli, TLS 1.3, Early Hints (ако origin праща Link preload).

**Cache Rules (редът е важен):**

1. Bypass: `/admin*`, `/api/auth*`, `/api/editor*`, `/api/staff*`, `/api/push/subscribe*`, cookie `better-auth*` / session.
2. Bypass или short TTL: HTML на персонализирани отговори (когато има logged-in reader prefs) — сега няма; дръж готови.
3. Cache: `/_next/static/*` — immutable, 1y, `Cache-Everything` + edge TTL 1y.
4. Cache: `/brand/*` — 1y immutable (origin вече праща това).
5. Cache: `/media/*` — cache by unique URL, edge TTL ≥ 30d, browser 1d–7d; Respect Strong ETags.
6. HTML страници (`/`, `/*/`): **не** глобално Cache Everything. Ползвай Cache Everything само с edge TTL ≤ 60s + `stale-while-revalidate`, или Cloudflare Polish off + origin ISR (`revalidate=60`). Vary на `Sec-CH-UA-Mobile` / `Sec-CH-Viewport-Width` трябва да се запази (origin вече Vary).
7. `/api/articles/*/speech/`: публичен cache (един запис за всички) — отделно правило; не `private`.

**Изключвай:** Rocket Loader; Auto Minify HTML ако чупи RSC; глобален „Cache Everything“ без изключения; email obfuscation върху Studio.

**Images (Cloudflare Images / Polish):** Polish = Lossy или WebP за `/media/*` е ОК; не разчитай да оправи липсващи variants в HTML.

**Purge при publish:** съществуващият `/api/revalidate` + `revalidatePath` чисти Next Data Cache. Добави Cloudflare purge (API token) за:
- `/`
- засегнатата `/рубрика/`
- `/{slug}/`
- опционално `Cache-Tag` ако се въведат tags на HTML.

Не разчитай Cloudflare да маскира тежък JS или грешен LCP `src`.

## Проверки след deploy

1. HTML size mobile vs desktop на `/` (очакване &lt; ~1.5 MB всяко, не ~3 MB).
2. PageSpeed mobile/desktop на начало, статия, рубрика.
3. LCP елемент = lead image с `srcset` и не lazy.
4. Рубрика `/balgariya/` → 200 (не 500).
5. Mobile rubric swipe pager още чете `data-mobile-rubric-model`.

## Media backfill (archive ladder)

Additive job on the server (does **not** overwrite masters):

```bash
pnpm --filter @newspoint/wp-import media:backfill -- --concurrency=2
# resume is automatic via logs/media-responsive-backfill.json
```

After editorial review of the site, remove only redundant legacy cards when the ladder is complete:

```bash
pnpm --filter @newspoint/wp-import media:cleanup-cards          # dry-run
pnpm --filter @newspoint/wp-import media:cleanup-cards -- --apply
```

Masters stay. `-card.webp` is what gets freed.
