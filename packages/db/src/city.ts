import { z } from "zod";
import { createTransactionClient } from "./connection";
import { diffCityRecords } from "./city-diff";
import { loadRootEnv, readDatabaseEnv } from "./env";

const recordSchema = z.object({
  key: z.string().min(1).max(500),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  fields: z.record(z.string(), z.union([z.string(), z.number()])),
});
const checkSchema = z.object({
  source: z.object({ id: z.string().min(1).max(150), category: z.string().min(1).max(80), url: z.url().startsWith("https://"), format: z.string().min(1).max(30) }),
  checkedAt: z.iso.datetime(),
  outcome: z.enum(["parsed", "unchanged", "failed"]),
  httpStatus: z.number().int().min(100).max(599).nullable().optional(),
  error: z.string().max(2000).optional(),
  refreshSeconds: z.number().int().min(300).max(604800).default(86400),
  items: z.array(recordSchema).max(2500).optional(),
});
export type CityPilotCheck = z.input<typeof checkSchema>;

export type CityDbSnapshot = {
  sourceId: string;
  checkedAt: string;
  outcome: "parsed" | "unchanged" | "unavailable";
  items: { key: string; fields: Record<string, string | number> }[];
};

/** Server-only read. Hidden pilot rows are available only in local development. */
export async function readCitySnapshots(options: { includeHidden?: boolean; sourceId?: string } = {}): Promise<CityDbSnapshot[]> {
  if (options.sourceId !== undefined && !/^[a-z0-9-]{1,150}$/u.test(options.sourceId)) throw new Error("Invalid city source identifier");
  if (options.includeHidden && process.env.NODE_ENV !== "development") {
    throw new Error("Hidden city pilot rows may only be read in development");
  }
  loadRootEnv();
  const sql = createTransactionClient(readDatabaseEnv("dev").DATABASE_URL, 1);
  try {
    const rows = await sql<{
      source_id: string;
      checked_at: Date | null;
      outcome: "parsed" | "unchanged" | "unavailable" | null;
      record_key: string | null;
      fields: Record<string, string | number> | null;
    }[]>`
      select s.id as source_id, s.last_check_at as checked_at, latest.outcome,
        r.record_key, r.fields
      from public.city_sources s
      left join lateral (
        select c.outcome from public.city_source_checks c
        where c.source_id = s.id order by c.checked_at desc, c.id desc limit 1
      ) latest on true
      left join public.city_records r on r.source_id = s.id and r.state = 'current'
      where ${options.includeHidden ? sql`true` : sql`s.review_state = 'accepted' and s.publication_state = 'visible'`}
        and ${options.sourceId ? sql`s.id = ${options.sourceId}` : sql`true`}
      order by s.id, r.record_key
    `;
    const snapshots = new Map<string, CityDbSnapshot>();
    for (const row of rows) {
      if (!row.checked_at || !row.outcome) continue;
      let snapshot = snapshots.get(row.source_id);
      if (!snapshot) {
        snapshot = { sourceId: row.source_id, checkedAt: row.checked_at.toISOString(), outcome: row.outcome, items: [] };
        snapshots.set(row.source_id, snapshot);
      }
      if (row.outcome !== "unavailable" && row.record_key && row.fields) {
        snapshot.items.push({ key: row.record_key, fields: row.fields });
      }
    }
    return [...snapshots.values()];
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** All writes remain shadow data; no operation here accepts publication state. */
export function createCityPilotWriter() {
  loadRootEnv();
  const sql = createTransactionClient(readDatabaseEnv("dev").DATABASE_URL, 1);
  return {
    async write(input: CityPilotCheck) {
      const check = checkSchema.parse(input);
      if (check.outcome === "parsed" && !check.items) throw new Error("Parsed city check needs records");
      if (check.outcome !== "parsed" && check.items) throw new Error("Only parsed city checks may change records");
      const uniqueKeys = new Set(check.items?.map(item => item.key));
      if (uniqueKeys.size !== (check.items?.length ?? 0)) throw new Error("Duplicate city record key");
      const checkedAt = new Date(check.checkedAt);
      return sql.begin(async tx => {
        await tx`
          insert into public.city_sources (id, category, source_url, format, refresh_seconds)
          values (${check.source.id}, ${check.source.category}, ${check.source.url}, ${check.source.format}, ${check.refreshSeconds})
          on conflict (id) do update set category=excluded.category, source_url=excluded.source_url,
            format=excluded.format, refresh_seconds=excluded.refresh_seconds, updated_at=now()
        `;
        const [locked] = await tx<{ last_check_at: Date | null }[]>`select last_check_at from public.city_sources where id=${check.source.id} for update`;
        if (locked?.last_check_at && locked.last_check_at.getTime() > checkedAt.getTime()) {
          throw new Error(`Out-of-order city check for ${check.source.id}`);
        }
        const existing = await tx<{ record_key: string; fingerprint: string; state: "current" | "missing"; fields: Record<string, string | number> }[]>`
          select record_key, fingerprint, state, fields from public.city_records where source_id=${check.source.id}
        `;
        let added = 0;
        let changed = 0;
        let missing = 0;
        if (check.outcome === "parsed") {
          const diff = diffCityRecords(existing.map(row => ({ key: row.record_key, fingerprint: row.fingerprint, state: row.state, fields: row.fields })), check.items ?? []);
          added = diff.added;
          changed = diff.changed;
          missing = diff.missing;
          await tx`
            insert into public.city_records (source_id, record_key, fields, fingerprint, first_seen_at, last_seen_at, state)
            select ${check.source.id}, row.key, row.fields, row.fingerprint, ${checkedAt}, ${checkedAt}, 'current'
            from jsonb_to_recordset(${tx.json(check.items ?? [])}::jsonb) as row(key text, fingerprint text, fields jsonb)
            on conflict (source_id, record_key) do update set fields=excluded.fields, fingerprint=excluded.fingerprint,
              last_seen_at=excluded.last_seen_at, state='current', missing_since=null, updated_at=now()
          `;
          if (diff.missingKeys.length) {
            await tx`
              update public.city_records set state='missing', missing_since=${checkedAt}, updated_at=now()
              where source_id=${check.source.id} and record_key in
                (select jsonb_array_elements_text(${tx.json(diff.missingKeys)}::jsonb))
            `;
          }
          if (diff.versions.length) await tx`
            insert into public.city_record_versions (source_id, record_key, fingerprint, fields, change_kind, observed_at)
            select ${check.source.id}, row.key, row.fingerprint, row.fields, row.kind, ${checkedAt}
            from jsonb_to_recordset(${tx.json(diff.versions)}::jsonb) as row(key text, fingerprint text, fields jsonb, kind text)
          `;
        }
        const outcome = check.outcome === "failed" ? "unavailable" : check.outcome;
        await tx`
          insert into public.city_source_checks (source_id, checked_at, outcome, http_status, item_count, added_count, changed_count, missing_count, detail)
          values (${check.source.id}, ${checkedAt}, ${outcome}, ${check.httpStatus ?? null}, ${check.items?.length ?? existing.length},
            ${added}, ${changed}, ${missing}, ${check.error ?? null})
        `;
        await tx`
          update public.city_sources set last_check_at=${checkedAt},
            last_success_at=case when ${outcome} in ('parsed','unchanged') then ${checkedAt} else last_success_at end,
            updated_at=now() where id=${check.source.id}
        `;
        return { added, changed, missing };
      });
    },
    close: () => sql.end({ timeout: 5 }),
  };
}
