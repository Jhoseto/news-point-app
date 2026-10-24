import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pilotSources } from "./catalog";

type Run = {
  sourceId: string;
  checkedAt: string;
  outcome: "parsed" | "unchanged" | "failed";
  httpStatus?: number | null;
  error?: string;
  itemCount?: number;
  changes?: { added: string[]; changed: string[]; missing: string[] };
};

const outputDir = resolve(process.env.CITY_PILOT_OUTPUT_DIR || resolve(import.meta.dirname, "../../../../tests/reports/city-source-pilot"));

function summarize(runs: Run[]) {
  const sorted = [...runs].sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt));
  const first = sorted[0];
  const last = sorted.at(-1);
  const successes = sorted.filter((run) => run.outcome !== "failed");
  const failures = sorted.filter((run) => run.outcome === "failed");
  const gaps = sorted.slice(1).map((run, index) => Date.parse(run.checkedAt) - Date.parse(sorted[index]!.checkedAt));
  const spanHours = first && last ? Math.round((Date.parse(last.checkedAt) - Date.parse(first.checkedAt)) / 36_000) / 100 : 0;
  const recentBlock = last?.outcome === "failed" && (last.httpStatus === 403 || /CERT|ISSUER|TLS/iu.test(last.error ?? ""));
  return {
    firstCheckedAt: first?.checkedAt ?? null,
    lastCheckedAt: last?.checkedAt ?? null,
    observedHours: spanHours,
    attempts: sorted.length,
    successfulChecks: successes.length,
    failedChecks: failures.length,
    maxCheckGapHours: gaps.length ? Math.round(Math.max(...gaps) / 36_000) / 100 : null,
    latestOutcome: last?.outcome ?? null,
    latestError: last?.error ?? null,
    lastItemCount: [...successes].at(-1)?.itemCount ?? null,
    editsObserved: sorted.reduce((sum, run) => sum + (run.changes?.changed.length ?? 0), 0),
    provisionalMissingObserved: sorted.reduce((sum, run) => sum + (run.changes?.missing.length ?? 0), 0),
    decision: recentBlock ? "blocked_on_source_access" : spanHours < 168 ? "collecting" : "manual_lifecycle_review_required",
  };
}

async function run(): Promise<void> {
  const lines = (await readFile(resolve(outputDir, "runs.jsonl"), "utf8")).trim().split(/\r?\n/u);
  const runs = lines.map((line) => JSON.parse(line) as Run);
  const sources = Object.fromEntries(pilotSources.map((source) => [source.id, summarize(runs.filter((run) => run.sourceId === source.id))]));
  const report = { generatedAt: new Date().toISOString(), note: "No source is automatically approved. Seven days plus cancellation, completeness and source-access review are required.", sources };
  await writeFile(resolve(outputDir, "assessment.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  for (const [sourceId, result] of Object.entries(sources)) process.stdout.write(`${sourceId}: ${result.decision}, ${result.successfulChecks}/${result.attempts} valid checks\n`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
