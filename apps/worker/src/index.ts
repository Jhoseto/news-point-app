import { parseArgs } from "node:util";
import { applyDueViewBoosts, createScriptDb, loadRootEnv, publishDueScheduled } from "@newspoint/db/node";
import { assertOutboxReady } from "./outbox-ready";
import { processOneAiPodcastJob } from "./ai-podcast-worker";
import { startPushWorker } from "./push-worker";
import { startSocialPublishingWorker } from "./social-publishing-worker";
import { startInstagramPublishingWorker } from "./instagram-publishing-worker";
import { startIndexNowWorker } from "./indexnow-worker";
import { reconcileAiCosts } from "./ai-cost-reconciliation";
import { processOneMediaUpload, cleanExpiredUploads } from "./media-upload-worker";

const { values: args } = parseArgs({ options: { once: { type: "boolean", default: false } } });

loadRootEnv();
installSupervision();
if (process.env.NP_UPLOAD_WORKER_ONLY === "1") {
  // Isolated QA and dedicated upload service: never sync WP, publish, send push or call AI.
  const { db, close } = createScriptDb("dev");
  let running = false;
  const tickUploads = async () => {
    if (running) return;
    running = true;
    try { await cleanExpiredUploads(db); await processOneMediaUpload(db); }
    catch (error) { console.error("[upload-worker]", error instanceof Error ? error.message : "unknown"); }
    finally { running = false; }
  };
  await tickUploads();
  if (args.once) await close();
  else {
    const timer = setInterval(() => void tickUploads(), 2000);
    const stop = () => { clearInterval(timer); void close().then(() => process.exit(0)); };
    process.on("SIGINT", stop); process.on("SIGTERM", stop);
  }
} else if (process.env.DEV_REMOTE === "1") {
  console.log("[worker] DEV_REMOTE=1: background work stays on the server.");
  setInterval(() => {}, 60 * 60 * 1000);
} else if (args.once) {
  console.error("[worker] --once is only available for isolated upload processing.");
  process.exitCode = 2;
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
  const { db, close } = createScriptDb("dev");

  function log(message: string) {
    console.log(`[worker ${new Date().toLocaleTimeString("bg-BG", { timeZone: "Europe/Sofia" })}] ${message}`);
  }

  const { startSmartWorker } = await import("./smart-worker");
  const stopPush = startPushWorker(db, log);
  const stopSocial = startSocialPublishingWorker(db, log);
  const stopInstagram = startInstagramPublishingWorker(db, log);
  const stopIndexNow = startIndexNowWorker(db, log);
  const stopSmart = startSmartWorker(db, log);
  let reconciling=false;
  const costTimer=setInterval(()=>{if(process.env.AI_COSTS_SYNC_ENABLED!=="1"||reconciling)return;reconciling=true;void reconcileAiCosts(db).catch(()=>log("AI cost reconciliation unavailable")).finally(()=>{reconciling=false;});},15*60_000);
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
    void cleanExpiredUploads(db).then(() => processOneMediaUpload(db)).then(processed => processed ? undefined : processOneAiPodcastJob(db))
      .catch((error) => log(`AI Studio queue failed: ${(error as Error).message}`))
      .finally(() => { aiBusy = false; });
  }, 5_000);

  let stopping:Promise<void>|null=null;
  function shutdown() {
    return stopping??=(async()=>{
      clearInterval(boostTimer);
      clearInterval(aiTimer);
      clearInterval(costTimer);
      const smartStopped=stopSmart();
      await stopPush();
      await stopSocial();
      await stopInstagram();
      await stopIndexNow();
      await smartStopped;
      await close();
    })();
  }

  process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

  for (;;) {
    try {
      await assertOutboxReady(db);
      break;
    } catch (error) {
      log(`${(error as Error).message}; checking again in 30s`);
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
  }

  log("ready: scheduled publication, view boosts, media/AI, push and social");
}
