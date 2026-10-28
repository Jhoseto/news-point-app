import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ScriptDb } from "@newspoint/db/node";
import { indexNowArticleUrl, indexNowRetryMs, readIndexNowConfig, type IndexNowConfig } from "@newspoint/content/indexnow";

type Job = { path: string; generation: number; attempts: number; lease_token: string };
const ENDPOINT = "https://api.indexnow.org/indexnow";

/** Locks are released before HTTP; crashed workers can reclaim expired leases. */
export async function claimIndexNowJobs(db: ScriptDb): Promise<Job[]> {
  const token = randomUUID();
  return db.transaction(async tx => {
    await tx.execute(sql`set local statement_timeout = '5s'`);
    return [...await tx.execute<Job>(sql`
      with due as (
        select path from public.indexnow_jobs
        where (status = 'pending' and due_at <= now())
           or (status = 'sending' and lease_until < now())
        order by due_at limit 50 for update skip locked
      )
      update public.indexnow_jobs j set status = 'sending', attempts = j.attempts + 1,
        lease_token = ${token}::uuid, lease_until = now() + interval '2 minutes'
      from due where j.path = due.path
      returning j.path, j.generation, j.attempts, j.lease_token` )];
  });
}

async function finish(db: ScriptDb, job: Job, status: string, httpStatus: number | null,
  error: string | null, delayMs = 0) {
  // A newer edit clears the old lease and increments generation: never acknowledge it accidentally.
  return db.execute(sql`update public.indexnow_jobs set status = ${status},
    last_status = ${httpStatus}, error_code = ${error}, lease_token = null, lease_until = null,
    due_at = now() + ${delayMs} * interval '1 millisecond',
    accepted_at = case when ${status} = 'accepted' then now() else null end
    where path = ${job.path} and generation = ${job.generation}
      and lease_token = ${job.lease_token}::uuid and status = 'sending'
    returning path`);
}

/** One small batch, bounded network time, no publication transaction depends on the service. */
export async function deliverIndexNowJobs(db: ScriptDb, jobs: Job[], config: IndexNowConfig,
  send: typeof fetch = fetch): Promise<{ accepted: number; retried: number; failed: number }> {
  const result = { accepted: 0, retried: 0, failed: 0 };
  const eligible: { job: Job; url: string }[] = [];
  for (const job of jobs) {
    const url = indexNowArticleUrl(job.path, config.origin);
    if (!url || job.attempts > 10) {
      const rows = await finish(db, job, "failed", null, url ? "retry_exhausted" : "invalid_public_path");
      if (rows.length) result.failed++;
    } else eligible.push({ job, url });
  }
  if (!eligible.length) return result;
  let status: number | null = null;
  let retryAfter: string | null = null;
  try {
    const response = await send(ENDPOINT, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: new URL(config.origin).host, key: config.key,
        keyLocation: config.keyLocation, urlList: [...new Set(eligible.map(item => item.url))] }),
    });
    status = response.status;
    retryAfter = response.headers.get("retry-after");
    await response.body?.cancel();
  } catch { /* Store only a bounded error code, never fetch errors containing request details. */ }
  for (const { job } of eligible) {
    const accepted = status === 200 || status === 202;
    const transient = status === null || status === 429 || (status >= 500 && status <= 599);
    const retry = transient && job.attempts < 10;
    const next = accepted ? "accepted" : retry ? "pending" : "failed";
    const rows = await finish(db, job, next, status,
      accepted ? null : status === null ? "transport_error" : `http_${status}`,
      retry ? indexNowRetryMs(job.attempts, retryAfter) : 0);
    if (rows.length) result[accepted ? "accepted" : retry ? "retried" : "failed"]++;
  }
  return result;
}

export function startIndexNowWorker(db: ScriptDb, log: (message: string) => void) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();
  let lastWarning = 0;
  let lastCleanup = 0;
  async function tick() {
    try {
      if (process.env.NP_INDEXNOW_ENABLED !== "1") return;
      const config = readIndexNowConfig();
      if (!config) throw new Error("configuration");
      if (Date.now() - lastCleanup > 3600_000) {
        await db.execute(sql`delete from public.indexnow_jobs
          where status in ('accepted','skipped') and updated_at < now() - interval '30 days'`);
        lastCleanup = Date.now();
      }
      const jobs = await claimIndexNowJobs(db);
      if (!stopped && jobs.length) {
        const result = await deliverIndexNowJobs(db, jobs, config);
        log(`IndexNow received=${result.accepted} retry=${result.retried} failed=${result.failed} (received is not indexed)`);
      }
    } catch {
      if (Date.now() - lastWarning > 60_000) {
        log("IndexNow paused: check migration 42, database and INDEXNOW configuration; no URLs or keys logged");
        lastWarning = Date.now();
      }
    } finally {
      if (!stopped) timer = setTimeout(() => { running = tick(); }, 15_000);
    }
  }
  running = tick();
  return async () => { stopped = true; clearTimeout(timer); await running; };
}
