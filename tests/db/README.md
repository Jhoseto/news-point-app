# DB performance audit

`run-audit.ts` свързва се към същата база като приложенията и:

1. Проверява версията на Postgres и обеми на основни таблици
2. Чете `pg_stat_user_tables` / `pg_stat_user_indexes` (seq scan vs index scan)
3. Пуска **`EXPLAIN (ANALYZE, BUFFERS)`** върху заявки, съответстващи на `apps/web/lib/queries.ts`
4. Маркира рискове (seq scan на големи таблици, бавни планове, липсващи индекси)
5. Записва markdown отчет в `tests/reports/db-audit-<timestamp>.md` и `tests/reports/db-audit-latest.md`

Пускане:

```bash
pnpm test:db:audit
```

Не променя данни. На production сървъра `ANALYZE` добавя кратко натоварване — при много трафик пускайте в по-тих час.
