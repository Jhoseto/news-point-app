import { createTransactionClient } from "../connection";
import { readCitySnapshots } from "../city";
import { describeConnection, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const target = new URL(DATABASE_URL);
if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/np2_newspoint2") {
  throw new Error(`Refusing unexpected database target: ${describeConnection(DATABASE_URL)}`);
}

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  const [counts] = await sql<{
    sources: number; checks: number; records: number; versions: number; visible: number;
  }[]>`
    select
      (select count(*)::int from public.city_sources) as sources,
      (select count(*)::int from public.city_source_checks) as checks,
      (select count(*)::int from public.city_records) as records,
      (select count(*)::int from public.city_record_versions) as versions,
      (select count(*)::int from public.city_sources where publication_state = 'visible') as visible
  `;
  console.log(JSON.stringify(counts));
  if (process.argv.includes("--preview")) {
    const snapshots = await readCitySnapshots({ includeHidden: true });
    console.log(JSON.stringify({ previewSources: snapshots.length, previewRecords: snapshots.reduce((sum, source) => sum + source.items.length, 0) }));
  }
} finally {
  await sql.end({ timeout: 5 });
}
