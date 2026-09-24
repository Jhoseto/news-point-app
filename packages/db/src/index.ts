import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import { createTransactionClient } from "./connection";
import { loadRootEnv, readDatabaseEnv } from "./env";

let instance: ReturnType<typeof drizzle> | undefined;

export function getDb() {
  if (!instance) {
    loadRootEnv();
    const env = readDatabaseEnv(process.env.NODE_ENV === "test" ? "test" : "dev");
    instance = drizzle(createTransactionClient(env.DATABASE_URL));
  }
  return instance;
}
