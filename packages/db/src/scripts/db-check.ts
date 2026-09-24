import { randomUUID } from "node:crypto";
import { createSessionClient, createTransactionClient } from "../connection";
import { describeConnection, loadRootEnv, readDatabaseEnv, type DatabaseTarget } from "../env";

const NOTIFY_TIMEOUT_MS = 5000;

async function checkTransactionPooler(url: string): Promise<string> {
  const sql = createTransactionClient(url, 1);
  try {
    const [row] = await sql<{ version: string }[]>`select version() as version`;
    return row?.version ?? "unknown";
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function checkListenNotify(url: string): Promise<boolean> {
  const sql = createSessionClient(url, 2);
  const channel = "np_db_check";
  const nonce = randomUUID();
  try {
    const received = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), NOTIFY_TIMEOUT_MS);
      void sql.listen(channel, (payload) => {
        if (payload === nonce) {
          clearTimeout(timer);
          resolve(true);
        }
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await sql.notify(channel, nonce);
    return await received;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function checkTarget(target: DatabaseTarget): Promise<boolean> {
  console.log(`\n[${target}]`);
  let env;
  try {
    env = readDatabaseEnv(target);
  } catch (error) {
    console.log(`  not configured: ${(error as Error).message}`);
    return false;
  }

  let ok = true;
  try {
    console.log(`  app connection (DATABASE_URL) ${describeConnection(env.DATABASE_URL)}`);
    console.log(`    ${await checkTransactionPooler(env.DATABASE_URL)}`);
  } catch (error) {
    ok = false;
    console.log(`    FAILED: ${(error as Error).message}`);
  }

  try {
    console.log(`  session connection (DATABASE_URL_SESSION) ${describeConnection(env.DATABASE_URL_SESSION)}`);
    const notified = await checkListenNotify(env.DATABASE_URL_SESSION);
    console.log(`    LISTEN/NOTIFY: ${notified ? "works" : `no notification within ${NOTIFY_TIMEOUT_MS} ms`}`);
    ok &&= notified;
  } catch (error) {
    ok = false;
    console.log(`    FAILED: ${(error as Error).message}`);
  }
  return ok;
}

loadRootEnv();
const results = [await checkTarget("dev"), await checkTarget("test")];
process.exitCode = results.every(Boolean) ? 0 : 1;
