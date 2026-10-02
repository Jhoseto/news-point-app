import { parseArgs } from "node:util";
import { applyDueViewBoosts, createScriptDb, loadRootEnv, publishDueScheduled } from "@newspoint/db/node";
import { WordPressSync, type SyncResult } from "@newspoint/wp-import/sync";
import { assertOutboxReady } from "./outbox-ready";
import { processOneAiPodcastJob } from "./ai-podcast-worker";

const { values: args } = parseArgs({ options: { once: { type: "boolean", default: false } } });

loadRootEnv();
installSupervision();
if (process.env.DEV_REMOTE === "1") {
  console.log("[worker] DEV_REMOTE=1: sync stays on the server.");
  setInterval(() => {}, 60 * 60 * 1000);
} else {
  await runWorker();
}

/** Make worker crashes visible. The supervisor (systemd / nohup) can then restart us. */
function installSupervision() {
  process.on("unhandledRejection", (reason) => {
    console.error(`[worker] unhandledRejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`);
  });
  process.on("uncaughtException", (error) => {
    console.error(`[worker] uncaughtException: ${error.stack ?? error.message}`);
    // Do not exit immediately: a transient DB or DNS blip would otherwise
    // silently drop the next 15-second boost + scheduled-publish cycle.
    // The supervisor's Restart=always picks us back up if we crash here.
  });
  console.log(`[worker] supervision installed (pid=${process.pid})`);
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
  const boostTimer = setInterval(() => {
    void applyDueViewBoosts(db)
      .then((updated) => { if (updated > 0) log(`view boosts updated ${updated}`); })
      .catch((error) => log(`view boost failed: ${(error as Error).message}`));
    void publishDueScheduled(db)
      .then((published) => { if (published > 0) log(`scheduled publish ${published}`); })
      .catch((error) => log(`scheduled publish failed: ${(error as Error).message}`));
  }, 15_000);
  let aiBusy = false;
  const aiTimer = setInterval(() => {
    if (aiBusy) return;
    aiBusy = true;
    void processOneAiPodcastJob(db)
      .catch((error) => log(`AI Studio queue failed: ${(error as Error).message}`))
      .finally(() => { aiBusy = false; });
  }, 5_000);

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
    clearInterval(boostTimer);
    clearInterval(aiTimer);
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
