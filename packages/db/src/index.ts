import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import { createTransactionClient } from "./connection";
import { loadRootEnv, readDatabaseEnv } from "./env";
import * as schema from "./schema";

export * from "./schema";

function createDb() {
  loadRootEnv();
  const env = readDatabaseEnv(process.env.NODE_ENV === "test" ? "test" : "dev");
  return drizzle(createTransactionClient(env.DATABASE_URL), { schema });
}

let instance: ReturnType<typeof createDb> | undefined;

export function getDb() {
  instance ??= createDb();
  return instance;
}
