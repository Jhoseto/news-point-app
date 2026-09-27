import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import { createSessionClient, createTransactionClient } from "./connection";
import { loadRootEnv, readDatabaseEnv } from "./env";
import * as schema from "./schema";

export * from "./schema";
export { hasMediaPresentations } from "./media-presentation";
export { loadRootEnv } from "./env";

function readEnv() {
  loadRootEnv();
  return readDatabaseEnv(process.env.NODE_ENV === "test" ? "test" : "dev");
}

function createDb() {
  return drizzle(createTransactionClient(readEnv().DATABASE_URL), { schema });
}

let instance: ReturnType<typeof createDb> | undefined;

export function getDb() {
  instance ??= createDb();
  return instance;
}

let listenClient: ReturnType<typeof createSessionClient> | undefined;

/** LISTEN needs a session connection; postgres.js re-subscribes after reconnects. */
export function listen(channel: string, onNotify: (payload: string) => void, onListen?: () => void) {
  listenClient ??= createSessionClient(readEnv().DATABASE_URL_SESSION, 1);
  return listenClient.listen(channel, onNotify, onListen);
}
