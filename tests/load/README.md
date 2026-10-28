# Load / spike tests

## Supervised HTTP/1.1 reader connections

`h1-capacity.mjs` defaults to a dry run. The explicit `--execute` mode requires
`NP_ORIGIN_ADDRESS`, `NP_ORIGIN_CA`, `NP_ARTICLE_PATH` and `NP_REPORT_FILE`.
Run only during an explicitly authorized production window with an independent
external health guard. No service or Cloudflare settings are changed.

The generator reads a real published article through Apache HTTPS with validated
SNI/Origin CA, downloads up to three sampled assets (media, JS, CSS), and holds one
SSE connection per reader. It ramps at five arrivals/second through
10/25/50/75/100/150/200/300/400 concurrent readers, holding each level for 60 seconds.
Health and Apache reserves are checked every three seconds. Two consecutive slow
or failed health checks, low Apache worker/memory reserves, or generator event-loop
delay stop the test. Lost SSE connections or missing heartbeats also stop it.
There is a 15-minute hard deadline, complete socket cleanup and recovery checks.

This is an **uncached origin connection-capacity scenario**, not full browsers,
a distributed Cloudflare load test or an absolute user maximum. The generator
runs on the server and may itself constrain the measurement. Keep reserve-based
stops distinct from service failure. A reached stage proves only a lower bound
for this workload. Public Cloudflare rate limiting from a single source must not
be reported as origin saturation. Never disable protections to inflate a score.

Safety logic checks: `pnpm exec vitest run tests/load/h1-capacity.test.ts`.

Симулира **много едновременни посещения** към читателския сайт (HTTP), без browser.

## spike-users.ts

**1000 „клика“** (GET заявки) разпределени равномерно в **5 секунди** (~200 req/s пик).

- Пътища: `/`, `/plovdiv/`, `/na-fokus/` (ротация)
- Метрики: успех %, latency min/p50/p95/p99/max, грешки по статус
- Отчет: `tests/reports/load-spike-latest.md`

### Подготовка

1. Тунел към базата (`dev-server-tunnel.bat`), ако сайтът чете от сървъра.
2. Сайтът трябва да **вече да работи** на `WEB_URL` (по подразбиране `http://localhost:3000`).

За по-реалистичен резултат от `next dev`:

```bash
pnpm --filter @newspoint/web build
pnpm --filter @newspoint/web start
```

### Пускане

```bash
pnpm test:load:spike
```

Променливи (optional):

| Env | Default | Meaning |
|-----|---------|---------|
| `LOAD_BASE_URL` | `WEB_URL` или `http://localhost:3000` | Origin |
| `LOAD_USERS` | `1000` | Брой заявки |
| `LOAD_WINDOW_MS` | `5000` | Прозорец за стартиране |
| `LOAD_WARMUP` | `5` | Загряване преди измерването |

**Внимание:** това натоварва локалната машина, тунела и сървърната Postgres. Не пускайте против production домейн без изрична молба.
