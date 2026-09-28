import { parseArgs } from "node:util";
import { createScriptDb, loadRootEnv } from "@newspoint/db/node";
import { WordPressSync, type SyncResult } from "@newspoint/wp-import/sync";
import { assertOutboxReady } from "./outbox-ready";

const { values: args } = parseArgs({ options: { once: { type: "boolean", default: false } } });

loadRootEnv();
if (process.env.DEV_REMOTE === "1") {
  console.log("[worker] DEV_REMOTE=1: sync stays on the server.");
  setInterval(() => {}, 60 * 60 * 1000);
} else {
  await runWorker();
}

async function runWorker() {
  const baseUrl = process.env.WP_SOURCE_URL ?? "https://newspoint.bg";
  const intervalSeconds = Math.max(30, Number(process.env.SYNC_INTERVAL_SECONDS ?? 120));

  const { db, close } = createScriptDb("dev");
  const sync = new WordPressSync(db, baseUrl);

  function log(message: string) {
    console.log(`[worker ${new Date().toLocaleTimeString("bg-BG", { timeZone: "Europe/Sofia" })}] ${message}`);
  }

  function describe(result: SyncResult): string {
    const { created, updated, unchanged } = result.changes;
    return (
      `since ${result.cursor}: ${result.fetched} fetched, ${created} new, ${updated} updated, ${unchanged} unchanged, ` +
      `${result.events} events, ${result.failed.length} failed, ${result.requests} requests`
    );
  }

  let stopping = false;
  let timer: NodeJS.Timeout | undefined;

  async function tick() {
    try {
      const result = await sync.run();
      log(describe(result));
      for (const failure of result.failed) log(`  failed ${failure.path}: ${failure.error}`);
    } catch (error) {
      log(`sync failed: ${(error as Error).message}`);
    }
    if (!stopping && !args.once) timer = setTimeout(tick, intervalSeconds * 1000);
  }

  async function shutdown() {
    stopping = true;
    clearTimeout(timer);
    await close();
  }

  process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

  for (;;) {
    try {
      await assertOutboxReady(db);
      break;
    } catch (error) {
      log(`${(error as Error).message}; checking again in 30s`);
      if (args.once) {
        await close();
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
  }

  log(`sync from ${baseUrl} every ${intervalSeconds}s`);
  await tick();
  if (args.once) await shutdown();
}
