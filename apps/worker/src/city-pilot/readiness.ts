import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CITY_CATEGORY_SOURCES, CITY_SOURCE_POLICY } from "@newspoint/content/city-sources";
import { pilotSources } from "./catalog";
import { CITY_CATEGORIES } from "../../../web/lib/city-guide/catalog";
import { CITY_TOPIC_SOURCES } from "../../../web/lib/city-guide/topic-coverage";

type CheckState = { lastCheckedAt?: string; lastSuccessAt?: string; nextDueAt?: string; failures: number };
type Snapshot = { checkedAt: string; outcome: string; items: unknown[] };

/** A local, read-only operational audit. No collection, DB writes or publication. */
export function cityReadiness(state: Record<string, CheckState>, snapshots: Record<string, Snapshot>, now = new Date()) {
  const sources = pilotSources.map(source => {
    const policy = CITY_SOURCE_POLICY[source.id];
    const check = state[source.id];
    const snapshot = snapshots[source.id];
    const due = Date.parse(check?.nextDueAt ?? "");
    const age = now.getTime() - Date.parse(snapshot?.checkedAt ?? "");
    const status = !policy ? "missing-policy" : !check ? "never-checked"
      : !Number.isFinite(due) ? "missing-schedule" : due < now.getTime() - 5 * 60_000 ? "overdue"
      : check.failures > 0 || snapshot?.outcome !== "observed" ? "unavailable"
      : !Number.isFinite(age) || age < 0 || age > policy.staleSeconds * 1000 ? "stale" : "healthy";
    return { id: source.id, category: source.category, status, ...policy,
      lastCheckedAt: check?.lastCheckedAt ?? null, lastSuccessAt: check?.lastSuccessAt ?? null,
      nextDueAt: check?.nextDueAt ?? null, failures: check?.failures ?? 0,
      storedRecords: snapshot?.items.length ?? 0 };
  });
  const categories = CITY_CATEGORIES.map(category => ({
    slug: category.slug, title: category.title,
    topics: category.topics.map(topic => {
      const ids = CITY_TOPIC_SOURCES[category.slug]?.[topic.title] ?? [];
      return { title: topic.title, sourceIds: ids,
        status: !ids.length ? "not-implemented" : ids.some(id => sources.some(source => source.id === id && source.status === "healthy")) ? "has-healthy-source" : "unavailable",
      };
    }),
  }));
  const active = new Set(pilotSources.map(source => source.id));
  const policyErrors = Object.entries(CITY_SOURCE_POLICY).flatMap(([id, policy]) =>
    !active.has(id) || policy.refreshSeconds > 86400 || policy.refreshSeconds < 300 || policy.staleSeconds <= policy.refreshSeconds ? [id] : []);
  const missingReaderSources = [...new Set(Object.values(CITY_CATEGORY_SOURCES).flat())].filter(id => !active.has(id));
  return { checkedAt: now.toISOString(), sources, categories, policyErrors, missingReaderSources,
    note: "Schedule and stored-snapshot audit, not proof of complete records, cancellations or production deployment." };
}

async function main() {
  const dir = resolve(process.env.CITY_GUIDE_STORAGE_DIR || process.env.CITY_PILOT_OUTPUT_DIR || resolve(import.meta.dirname, "../../../../tests/reports/city-preview-live"));
  const state = JSON.parse(await readFile(resolve(dir, "state.json"), "utf8"));
  const preview = JSON.parse(await readFile(resolve(dir, "preview.json"), "utf8"));
  const report = cityReadiness(state.sources, preview.sources);
  await writeFile(resolve(dir, "readiness.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ sources: report.sources.length, status: report.sources.reduce<Record<string, number>>((counts, source) => { counts[source.status] = (counts[source.status] ?? 0) + 1; return counts; }, {}), policyErrors: report.policyErrors, missingReaderSources: report.missingReaderSources }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
