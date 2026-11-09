/** Supervised public production HTTP reader journey. Explicit --execute only. */
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const BASE = 'https://newspoint.bg';
const STAGES = [10, 50, 100, 250, 500, 1000];
const ARRIVAL_MS = 200;
const DWELL_MS = 30_000;
const THINK_MS = 45_000;
const MAX_MS = 12 * 60_000;
const here = dirname(fileURLToPath(import.meta.url));
const reportFile = resolve(here, '../reports/public-reader-journey-latest.json');
const agent = 'NewsPointProductionLoadTest/1.0';

export function unhealthy(probes, baselineMs) {
  return probes.some((probe) => probe.status !== 200 || probe.ms > Math.max(2000, baselineMs * 5));
}

export function responseStopReason(result) {
  if (result.challenge || result.status === 429 || result.status === 403) return 'edge-protection';
  if (result.status !== 200) return 'request-failure';
  return null;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

async function get(path) {
  const started = performance.now();
  try {
    const response = await fetch(`${BASE}${path}`, {
      redirect: 'follow',
      headers: { accept: 'text/html', 'user-agent': agent },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    return {
      path,
      status: response.status,
      ms: Math.round(performance.now() - started),
      body,
      challenge: response.headers.get('cf-mitigated') === 'challenge',
    };
  } catch (error) {
    return { path, status: 0, ms: Math.round(performance.now() - started), body: '', error: error?.cause?.code || String(error) };
  }
}

async function preflight() {
  const home = await get('/');
  const studio = await get('/admin/login/');
  if (home.status !== 200 || studio.status !== 200) throw Error(`Public baseline failed: Web ${home.status}, Studio ${studio.status}`);
  const candidates = [...new Set([...home.body.matchAll(/href="(\/[a-z0-9-]+\/)"/g)].map((match) => match[1]))]
    .filter((path) => !['/plovdiv/', '/region/', '/na-fokus/', '/admin/'].includes(path));
  const articles = [];
  for (const path of candidates.slice(0, 30)) {
    const result = await get(path);
    if (result.status === 200 && result.body.includes('np-public-article')) articles.push(path);
    if (articles.length === 4) break;
  }
  if (articles.length < 2) throw Error('Fewer than two current published articles passed preflight');
  return { articles, baselineMs: Math.max(home.ms, studio.ms), homeMs: home.ms, studioMs: studio.ms };
}

async function generator() {
  const articles = JSON.parse(process.env.NP_LOAD_ARTICLES || '[]');
  if (!Array.isArray(articles) || articles.length < 2 || articles.some((path) => !/^\/[a-z0-9-]+\/$/.test(path))) throw Error('Invalid article preflight');
  let stopping = false;
  let stopReason = 'configured-ceiling-reached';
  let active = 0;
  let peakActive = 0;
  let stageTarget = 0;
  const tasks = [];
  const samples = [];
  const stages = [];
  const waiters = new Set();
  const lag = monitorEventLoopDelay({ resolution: 20 });
  lag.enable();
  let maxLagMs = 0;
  let badLag = 0;
  const startedAt = new Date().toISOString();
  const stop = (reason) => {
    if (!stopping) {
      stopping = true;
      stopReason = reason;
      for (const wake of waiters) wake();
    }
  };
  const pause = (ms) => new Promise((resolve) => {
    const wake = () => { clearTimeout(timer); waiters.delete(wake); resolve(); };
    const timer = setTimeout(wake, ms);
    waiters.add(wake);
  });
  process.on('SIGTERM', () => stop('external-health-guard'));
  process.on('SIGINT', () => stop('operator-stop'));
  process.on('message', (message) => { if (message === 'stop') stop('external-health-guard'); });
  const deadline = setTimeout(() => stop('time-budget'), MAX_MS);
  const lagGuard = setInterval(() => {
    const ms = Math.round(lag.max / 1e6);
    maxLagMs = Math.max(maxLagMs, ms);
    badLag = ms > 100 ? badLag + 1 : 0;
    if (badLag >= 2) stop('generator-limited');
    lag.reset();
  }, 3000);

  async function request(path) {
    const result = await get(path);
    samples.push({ path, stageTarget, status: result.status, ms: result.ms, challenge: result.challenge, error: result.error });
    const reason = responseStopReason(result);
    if (reason) stop(reason);
    return result;
  }

  async function reader(index) {
    active++;
    peakActive = Math.max(peakActive, active);
    try {
      await request('/');
      if (!stopping) await request(articles[index % articles.length]);
      while (!stopping) {
        await pause(THINK_MS);
        if (!stopping) await request(articles[(index + 1) % articles.length]);
      }
    } finally { active--; }
  }

  try {
    for (const target of STAGES) {
      if (stopping) break;
      stageTarget = target;
      while (tasks.length < target && !stopping) {
        tasks.push(reader(tasks.length));
        await pause(ARRIVAL_MS);
      }
      const until = Date.now() + DWELL_MS;
      while (Date.now() < until && !stopping) await pause(250);
      stages.push({ target, active, complete: !stopping, at: new Date().toISOString() });
      if (!stopping) process.send?.({ stage: target, active, samples: samples.length });
    }
  } finally {
    clearTimeout(deadline);
    clearInterval(lagGuard);
    lag.disable();
    stopping = true;
    await Promise.allSettled(tasks);
    const statusCounts = Object.fromEntries([...new Set(samples.map((s) => s.status))].sort((a, b) => a - b).map((status) => [status, samples.filter((s) => s.status === status).length]));
    const errorCounts = Object.fromEntries([...new Set(samples.map((s) => s.error).filter(Boolean))].map((error) => [error, samples.filter((s) => s.error === error).length]));
    const successful = samples.filter((s) => s.status === 200).map((s) => s.ms);
    const byStage = STAGES.filter((stage) => samples.some((s) => s.stageTarget === stage)).map((stage) => {
      const subset = samples.filter((s) => s.stageTarget === stage);
      return { stage, requests: subset.length, failures: subset.filter((s) => s.status !== 200).length, p95Ms: percentile(subset.filter((s) => s.status === 200).map((s) => s.ms), .95) };
    });
    const recovery = await Promise.all([get('/'), get('/admin/login/')]);
    const report = {
      startedAt, finishedAt: new Date().toISOString(), scope: 'Public Cloudflare HTTP from one test IP; no browser JavaScript or Clicky visits',
      articles, stopReason, stages, highestCompleted: Math.max(0, ...stages.filter((s) => s.complete).map((s) => s.target)),
      launched: tasks.length, peakActive, maxGeneratorLagMs: maxLagMs,
      requests: samples.length, statusCounts, errorCounts, byStage, p50Ms: percentile(successful, .5), p95Ms: percentile(successful, .95), p99Ms: percentile(successful, .99),
      recovery: recovery.map(({ path, status, ms }) => ({ path, status, ms })),
    };
    mkdirSync(dirname(reportFile), { recursive: true });
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
    process.send?.({ result: report });
    process.disconnect?.();
  }
}

async function supervise() {
  const baseline = await preflight();
  console.log(JSON.stringify({ event: 'baseline', ...baseline }));
  const child = fork(fileURLToPath(import.meta.url), ['--generator'], {
    env: { ...process.env, NP_LOAD_ARTICLES: JSON.stringify(baseline.articles) },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  let bad = 0;
  let checking = false;
  let finished = false;
  let stopSent = false;
  const stopChild = () => {
    if (stopSent) return;
    stopSent = true;
    child.send('stop');
    setTimeout(() => { if (!finished) child.kill(); }, 15_000).unref();
  };
  const timer = setInterval(async () => {
    if (checking || finished) return;
    checking = true;
    try {
      const probes = await Promise.all([get('/'), get('/admin/login/')]);
      bad = unhealthy(probes, baseline.baselineMs) ? bad + 1 : 0;
      if (bad >= 2) { console.error('External public health guard stopped the test'); stopChild(); clearInterval(timer); }
    } catch { stopChild(); clearInterval(timer); }
    finally { checking = false; }
  }, 3000);
  const hardStop = setTimeout(stopChild, MAX_MS);
  child.on('message', (message) => console.log(JSON.stringify(message)));
  await new Promise((resolve) => child.on('exit', resolve));
  finished = true;
  clearInterval(timer);
  clearTimeout(hardStop);
  const recovery = await Promise.all([get('/'), get('/admin/login/')]);
  console.log(JSON.stringify({ event: 'supervisor-recovery', probes: recovery.map(({ path, status, ms }) => ({ path, status, ms })) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--generator')) await generator();
  else if (process.argv.includes('--preflight')) console.log(JSON.stringify({ preflight: await preflight() }));
  else if (process.argv.includes('--execute')) await supervise();
  else console.log(JSON.stringify({ dryRun: true, base: BASE, stages: STAGES, arrivalPerSecond: 5, dwellSeconds: DWELL_MS / 1000, thinkSeconds: THINK_MS / 1000, maxMinutes: MAX_MS / 60_000 }));
}
