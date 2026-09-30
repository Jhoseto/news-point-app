/**
 * Run on the np2 server with its node binary.
 * LOAD_BASE_URL=https://... LOAD_USERS=1000 LOAD_WINDOW_MS=5000 node server-spike.mjs
 */
const base = (process.env.LOAD_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const users = Number(process.env.LOAD_USERS || 1000);
const windowMs = Number(process.env.LOAD_WINDOW_MS || 5000);
const warmup = Number(process.env.LOAD_WARMUP || 3);
const paths = ["/", "/plovdiv/", "/na-fokus/"];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function hit(path) {
  const start = performance.now();
  try {
    const response = await fetch(`${base}${path}`, {
      redirect: "follow",
      headers: { Accept: "text/html", "User-Agent": "NewsPointServerLoad/1.0" },
      signal: AbortSignal.timeout(60_000),
    });
    return { path, status: response.status, ms: performance.now() - start, ok: response.ok };
  } catch (error) {
    return {
      path,
      status: 0,
      ms: performance.now() - start,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const probe = await hit("/");
if (!probe.ok) {
  console.error(JSON.stringify({ base, probe, fatal: "health check failed" }));
  process.exit(1);
}

for (let i = 0; i < warmup; i += 1) await hit(paths[i % paths.length]);

const tasks = [];
for (let i = 0; i < users; i += 1) {
  const delay = users <= 1 ? 0 : Math.floor((i / users) * windowMs);
  const path = paths[i % paths.length];
  tasks.push(new Promise((resolve) => setTimeout(() => hit(path).then(resolve), delay)));
}

const started = performance.now();
const samples = await Promise.all(tasks);
const wallMs = performance.now() - started;
const ok = samples.filter((sample) => sample.ok);
const lat = ok.map((sample) => sample.ms).sort((a, b) => a - b);
const byStatus = {};
const byError = {};
for (const sample of samples) {
  byStatus[sample.status] = (byStatus[sample.status] || 0) + 1;
  if (sample.error) byError[sample.error] = (byError[sample.error] || 0) + 1;
}

console.log(JSON.stringify({
  base,
  users,
  windowMs,
  ok: ok.length,
  total: samples.length,
  okRate: samples.length ? ok.length / samples.length : 0,
  wallMs,
  p50: percentile(lat, 50),
  p95: percentile(lat, 95),
  p99: percentile(lat, 99),
  max: lat.length ? lat[lat.length - 1] : 0,
  byStatus,
  byError,
}, null, 2));
process.exit(ok.length / samples.length >= 0.99 && percentile(lat, 95) <= 8000 ? 0 : 1);
