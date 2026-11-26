import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const target = new URL(DATABASE_URL);
if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/np2_newspoint2") {
  throw new Error("Expected the NewsPoint database through the local SSH tunnel.");
}
const migration = readFileSync(resolve(findRepoRoot(), "packages/db/migrations/52_polit_compass_reports.sql"), "utf8");
const sql = createTransactionClient(DATABASE_URL, 1);
try {
  await sql.begin(async tx => {
    const [row] = await tx`select current_database() as db, to_regclass('public.polit_compass_reports') as existing`;
    if (row.db !== "np2_newspoint2") throw new Error("Unexpected database.");
    if (!row.existing) await tx.unsafe(migration);
    await tx`select code, request_key, snapshot from public.polit_compass_reports limit 0`;
  });
  console.log("Migration 52 verified in np2_newspoint2.");
} finally {
  await sql.end({ timeout: 5 });
}
