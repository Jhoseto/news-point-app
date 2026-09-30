# NewsPoint tests (local / CI helpers)

Тук живеят **скриптове и одити извън** unit тестовете в `packages/*` и `apps/*` (vitest).

| Папка | Съдържание |
|-------|------------|
| `db/` | Одит на Postgres: индекси, `EXPLAIN ANALYZE`, изводи за производителност |
| `load/` | HTTP spike (1000 „потребителя“ за 5 s) към `WEB_URL` |
| `reports/` | Генерирани отчети (локално; не се commit-ват) |

## Команди

```bash
# Схема спрямо Drizzle (бърза проверка)
pnpm db:verify

# Пълен DB одит + отчет в tests/reports/
pnpm test:db:audit
```

Изисква `.env.local` и работещ тунел към `np2_newspoint2` (както при Studio).

```bash
# Spike: 1000 GET за ~5 s (сайтът трябва да върви на WEB_URL)
pnpm test:load:spike
```
