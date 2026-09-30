/**
 * Spike load: N HTTP GETs to public pages, launch times spread over a window.
 * Read-only against the web app. Writes tests/reports/load-spike-latest.md
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot, loadRootEnv } from "../../packages/db/src/env.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(here);
const reportsDir = resolve(repoRoot, "tests/reports");

const PATHS = ["/", "/plovdiv/", "/na-fokus/"];

interface Sample {
  path: string;
  status: number;
  ms: number;
  ok: boolean;
  error?: string;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function envUrl(): string {
  const explicit = process.env.LOAD_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const web = process.env.WEB_URL?.trim();
  if (web) return web.replace(/\/$/, "");
  return "http://localhost:3000";
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

async function fetchPage(base: string, path: string): Promise<Sample> {
  const url = `${base}${path}`;
  const start = performance.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "NewsPointLoadTest/1.0",
      },
      signal: AbortSignal.timeout(120_000),
    });
    const ms = performance.now() - start;
    return { path, status: response.status, ms, ok: response.ok };
  } catch (error) {
    const ms = performance.now() - start;
    return {
      path,
      status: 0,
      ms,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function scheduleSpike(base: string, users: number, windowMs: number): Promise<Sample>[] {
  const tasks: Promise<Sample>[] = [];
  for (let i = 0; i < users; i += 1) {
    const delayMs = users <= 1 ? 0 : Math.floor((i / users) * windowMs);
    const path = PATHS[i % PATHS.length]!;
    tasks.push(
      new Promise<Sample>((resolve) => {
        setTimeout(() => {
          void fetchPage(base, path).then(resolve);
        }, delayMs);
      }),
    );
  }
  return tasks;
}

function verdict(input: {
  okRate: number;
  p95: number;
  p99: number;
  errors: number;
  maxMs: number;
  totalWallMs: number;
  windowMs: number;
}): string[] {
  const lines: string[] = [];
  const passOk = input.okRate >= 0.99;
  const passP95 = input.p95 <= 8000;
  const passP99 = input.p99 <= 15000;

  if (passOk && passP95 && passP99) {
    lines.push("**Общо: ПРЕМИНА** — при този spike сайтът отговори стабилно (≥99% успех, p95 ≤ 8 s, p99 ≤ 15 s).");
  } else if (input.okRate >= 0.95) {
    lines.push("**Общо: ГРАНИЧНО** — повечето заявки минаха, но има забавяния или грешки; вижте детайлите.");
  } else {
    lines.push("**Общо: НЕ ПРЕМИНА** — твърде много неуспешни заявки или силно забавяне.");
  }

  if (!passOk) lines.push(`Успех ${(input.okRate * 100).toFixed(1)}% (цел ≥99%).`);
  if (!passP95) lines.push(`p95 ${input.p95.toFixed(0)} ms (цел ≤8000 ms за SSR + тунел).`);
  if (!passP99) lines.push(`p99 ${input.p99.toFixed(0)} ms (цел ≤15000 ms).`);
  lines.push(`Стенен час: ${(input.totalWallMs / 1000).toFixed(2)} s (прозорец ${input.windowMs / 1000} s + опашка от SSR).`);
  lines.push("Dev (`next dev`) + SSH тунел + много паралелни SSR **не** са production; повторете с `next build && next start` или на сървъра :3100.");
  return lines;
}

function renderReport(input: {
  generatedAt: string;
  base: string;
  users: number;
  windowMs: number;
  warmup: number;
  samples: Sample[];
  wallMs: number;
}): string {
  const ok = input.samples.filter((s) => s.ok);
  const latencies = ok.map((s) => s.ms).sort((a, b) => a - b);
  const allMs = input.samples.map((s) => s.ms).sort((a, b) => a - b);
  const okRate = input.samples.length ? ok.length / input.samples.length : 0;
  const byStatus = new Map<number, number>();
  const byError = new Map<string, number>();
  for (const s of input.samples) {
    byStatus.set(s.status, (byStatus.get(s.status) ?? 0) + 1);
    if (s.error) byError.set(s.error, (byError.get(s.error) ?? 0) + 1);
  }

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const maxMs = latencies.length ? latencies[latencies.length - 1]! : 0;

  const lines: string[] = [
    "# Load spike — NewsPoint web",
    "",
    `Генериран: ${input.generatedAt}`,
    "",
    "## Параметри",
    "",
    `- Base URL: \`${input.base}\``,
    `- Потребители (заявки): **${input.users}**`,
    `- Прозорец за старт: **${input.windowMs} ms** (~${(input.users / (input.windowMs / 1000)).toFixed(0)} req/s)`,
    `- Warmup: ${input.warmup} заявки`,
    `- Пътища: ${PATHS.map((p) => `\`${p}\``).join(", ")}`,
    "",
    "## Резултат",
    "",
    `| Метрика | Стойност |`,
    `|---------|----------|`,
    `| Успешни (2xx) | ${ok.length} / ${input.samples.length} (${(okRate * 100).toFixed(1)}%) |`,
    `| Неуспешни | ${input.samples.length - ok.length} |`,
    `| Latency p50 (OK) | ${p50.toFixed(0)} ms |`,
    `| Latency p95 (OK) | ${p95.toFixed(0)} ms |`,
    `| Latency p99 (OK) | ${p99.toFixed(0)} ms |`,
    `| Latency max (OK) | ${maxMs.toFixed(0)} ms |`,
    `| Max (вкл. грешки) | ${allMs.length ? allMs[allMs.length - 1]!.toFixed(0) : "—"} ms |`,
    `| Общ wall time | ${(input.wallMs / 1000).toFixed(2)} s |`,
    "",
    "### HTTP статуси",
    "",
  ];

  for (const [status, count] of [...byStatus.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(`- \`${status}\`: ${count}`);
  }

  if (byError.size) {
    lines.push("", "### Грешки", "");
    for (const [msg, count] of byError.entries()) {
      lines.push(`- ${msg}: ${count}`);
    }
  }

  lines.push("", "## Извод", "");
  for (const v of verdict({
    okRate,
    p95,
    p99,
    errors: input.samples.length - ok.length,
    maxMs,
    totalWallMs: input.wallMs,
    windowMs: input.windowMs,
  })) {
    lines.push(`- ${v}`);
  }
  lines.push("");

  return lines.join("\n");
}

async function main(): Promise<void> {
  loadRootEnv();
  const base = envUrl();
  const users = envInt("LOAD_USERS", 1000);
  const windowMs = envInt("LOAD_WINDOW_MS", 5000);
  const warmup = envInt("LOAD_WARMUP", 5);

  console.log(`Load spike → ${base} (${users} users / ${windowMs} ms window)`);

  try {
    const probe = await fetchPage(base, "/");
    if (!probe.ok) {
      console.error(`Health check failed: ${probe.status} ${probe.error ?? ""}`);
      console.error("Стартирайте apps/web на WEB_URL и опитайте отново.");
      process.exitCode = 1;
      return;
    }
    console.log(`Warmup ${warmup}…`);
    for (let i = 0; i < warmup; i += 1) {
      await fetchPage(base, PATHS[i % PATHS.length]!);
    }

    console.log(`Spike ${users}…`);
    const started = performance.now();
    const tasks = scheduleSpike(base, users, windowMs);
    const samples = await Promise.all(tasks);
    const wallMs = performance.now() - started;

    const generatedAt = new Date().toISOString();
    const markdown = renderReport({
      generatedAt,
      base,
      users,
      windowMs,
      warmup,
      samples,
      wallMs,
    });

    mkdirSync(reportsDir, { recursive: true });
    const stamp = generatedAt.replace(/[:.]/g, "-").slice(0, 19);
    writeFileSync(resolve(reportsDir, `load-spike-${stamp}.md`), markdown, "utf8");
    writeFileSync(resolve(reportsDir, "load-spike-latest.md"), markdown, "utf8");

    const okCount = samples.filter((s) => s.ok).length;
    console.log(`Done: ${okCount}/${samples.length} OK, wall ${(wallMs / 1000).toFixed(2)}s`);
    console.log(`Report: tests/reports/load-spike-latest.md`);

    const okRate = okCount / samples.length;
    const latencies = samples.filter((s) => s.ok).map((s) => s.ms).sort((a, b) => a - b);
    const p95 = percentile(latencies, 95);
    process.exitCode = okRate >= 0.99 && p95 <= 8000 ? 0 : 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

await main();
