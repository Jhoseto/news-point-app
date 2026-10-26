import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CITY_CATEGORY_SOURCES, CITY_SOURCE_POLICY, CITY_DEFERRED_CATEGORIES, citySourceInRelease } from "@newspoint/content/city-sources";
import { pilotSources } from "./catalog";
import { CITY_CATEGORIES } from "../../../web/lib/city-guide/catalog";
import { CITY_TOPIC_SOURCES } from "../../../web/lib/city-guide/topic-coverage";
import { CITY_PRESENTATION } from "../../../web/lib/city-guide/presentation";

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
    return { id: source.id, category: source.category, inRelease: citySourceInRelease(source.id), status, ...policy,
      lastCheckedAt: check?.lastCheckedAt ?? null, lastSuccessAt: check?.lastSuccessAt ?? null,
      nextDueAt: check?.nextDueAt ?? null, failures: check?.failures ?? 0,
      storedRecords: snapshot?.items.length ?? 0 };
  });
  const categories = CITY_CATEGORIES.map(category => ({
    slug: category.slug, title: category.title,
    deferred: CITY_DEFERRED_CATEGORIES.includes(category.slug),
    topics: category.topics.map(topic => {
      const ids = CITY_TOPIC_SOURCES[category.slug]?.[topic.title] ?? [];
      const implementedFilter = category.slug === "nightlife" && ["Тази вечер", "Уикенда"].includes(topic.title);
      const interestFilter = category.slug === "nightlife" && ["Безплатно", "DJ и електронна музика", "Рап и хип-хоп", "Попфолк, балканска и турска музика", "Студентски вечери", "Куизове", "Настолни игри"].includes(topic.title);
      const elsewhere = topic.title === "Концерти" ? "nightlife / live" : category.slug === "nightlife" && topic.title === "Творчески работилници" ? "culture / community" : null;
      return { title: topic.title, sourceIds: ids,
        ...(elsewhere ? { coveredElsewhere: elsewhere } : {}),
        status: CITY_DEFERRED_CATEGORIES.includes(category.slug) || ids.length > 0 && ids.every(id => !citySourceInRelease(id)) ? "deferred" : implementedFilter ? "date-filter" : interestFilter ? "interest-filter-needs-matching-events" : elsewhere ? "covered-elsewhere" : !ids.length ? "not-implemented" : ids.every(id => CITY_PRESENTATION[id]?.utility) ? "supporting-contact-only"
          : ids.every(id => id === "plovdiv-council") ? "insufficient-content"
          : ids.some(id => sources.some(source => source.id === id && source.status === "healthy")) ? "has-healthy-source" : "unavailable",
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
  const runs = (await readFile(resolve(dir, "runs.jsonl"), "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const evidence = report.sources.map(source => {
    const checks = runs.filter(check => check.sourceId === source.id);
    return { sourceId: source.id, checks: checks.length, successful: checks.filter(check => check.outcome !== "failed").length,
      failures: checks.filter(check => check.outcome === "failed").length,
      firstCheck: checks[0]?.checkedAt ?? null, lastCheck: checks.at(-1)?.checkedAt ?? null };
  });
  await writeFile(resolve(dir, "readiness.json"), JSON.stringify({ ...report, evidence }, null, 2) + "\n");
  const releaseSources = report.sources.filter(source => source.inRelease);
  console.log(JSON.stringify({ releaseSources: releaseSources.length, deferredSources: report.sources.length - releaseSources.length, status: releaseSources.reduce<Record<string, number>>((counts, source) => { counts[source.status] = (counts[source.status] ?? 0) + 1; return counts; }, {}), policyErrors: report.policyErrors, missingReaderSources: report.missingReaderSources }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
