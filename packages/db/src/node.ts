// Database access for Node scripts (importer, sync, checks). Apps use the
// server-only entry point instead.
import { drizzle } from "drizzle-orm/postgres-js";
import { createSessionClient } from "./connection";
import { loadRootEnv, readDatabaseEnv, type DatabaseTarget } from "./env";
import * as schema from "./schema";

export function createScriptDb(target: DatabaseTarget = "dev", maxConnections = 3) {
  loadRootEnv();
  const env = readDatabaseEnv(target);
  const client = createSessionClient(env.DATABASE_URL_SESSION, maxConnections);
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}

export type ScriptDb = ReturnType<typeof createScriptDb>["db"];

export { loadRootEnv, findRepoRoot } from "./env";
export * from "./schema";
export { hasMediaPresentations } from "./media-presentation";
export { applyDueViewBoosts } from "./view-boosts";
export { publishDueScheduled } from "./scheduled-publish";
