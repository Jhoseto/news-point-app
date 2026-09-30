# Load / spike tests

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
