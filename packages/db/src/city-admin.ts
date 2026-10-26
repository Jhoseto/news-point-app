import "server-only";
import type { CitySourceSummary, CityManagementInput } from "@newspoint/content/city-management";
import { cityManagementChange } from "@newspoint/content/city-management";
import { createTransactionClient } from "./connection";
import { loadRootEnv, readDatabaseEnv } from "./env";

function client() { loadRootEnv(); return createTransactionClient(readDatabaseEnv("dev").DATABASE_URL, 1); }
const validId = (id: string) => /^[a-z0-9-]{1,150}$/u.test(id);
export async function readCityManagement(): Promise<CitySourceSummary[]> {
  const sql = client();
  try {
    return await sql<CitySourceSummary[]>`
      select s.id, s.category, s.source_url as "sourceUrl", s.format,
        s.review_state as "reviewState", s.publication_state as "publicationState",
        md5(s.updated_at::text) as version,
        to_char(s.last_check_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "lastCheckAt",
        to_char(s.last_success_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "lastSuccessAt",
        latest.outcome, latest.detail as error,
        (select count(*)::int from public.city_records r where r.source_id=s.id and r.state='current') as "currentRecords",
        (select count(*)::int from public.city_records r where r.source_id=s.id and r.state='missing') as "missingRecords",
        to_char(history.first_check at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "firstCheckAt",
        history.successful as "successfulChecks", history.failed as "failedChecks"
      from public.city_sources s
      left join lateral (select outcome, detail from public.city_source_checks c where c.source_id=s.id order by c.checked_at desc, c.id desc limit 1) latest on true
      left join lateral (select min(checked_at) as first_check,
        count(*) filter(where outcome <> 'unavailable')::int as successful,
        count(*) filter(where outcome = 'unavailable')::int as failed
        from public.city_source_checks c where c.source_id=s.id) history on true
      order by s.category, s.id limit 200
    `;
  } finally { await sql.end({ timeout: 5 }); }
}
export async function readCityManagementDetail(id: string, offset = 0, recordKey?: string) {
  if (!validId(id) || !Number.isInteger(offset) || offset < 0 || offset > 100000 || recordKey !== undefined && recordKey.length > 500) throw new Error("invalid_input");
  const sql = client();
  try {
    const checks = await sql`select id::text, checked_at, outcome, http_status, item_count, added_count, changed_count, missing_count, detail
      from public.city_source_checks where source_id=${id} order by checked_at desc, id desc limit 20`;
    const records = await sql`select record_key, fields, state, first_seen_at, last_seen_at, missing_since
      from public.city_records where source_id=${id} order by state, record_key limit 50 offset ${offset}`;
    const versions = recordKey === undefined ? [] : await sql`select id::text, change_kind, observed_at, fields
      from public.city_record_versions where source_id=${id} and record_key=${recordKey} order by observed_at desc, id desc limit 10`;
    return { checks, records, versions, offset };
  } finally { await sql.end({ timeout: 5 }); }
}
export async function changeCityManagement(input: CityManagementInput) {
  const sql = client();
  try {
    // Read evidence before taking a short source lock; recheck the version under lock.
    const source = (await readCityManagement()).find(row => row.id === input.id);
    if (!source) throw new Error("not_found");
    return await sql.begin(async tx => {
      const [locked] = await tx<{ version: string }[]>`select md5(updated_at::text) as version from public.city_sources where id=${input.id} for update`;
      if (!locked || locked.version !== source.version) throw new Error("conflict");
      const after = cityManagementChange(source, input);
      await tx`update public.city_sources set review_state=${after.reviewState}, publication_state=${after.publicationState}, updated_at=now() where id=${input.id}`;
      return { before: { id: source.id, reviewState: source.reviewState, publicationState: source.publicationState }, after: { id: source.id, ...after }, note: input.note };
    });
  } finally { await sql.end({ timeout: 5 }); }
}
