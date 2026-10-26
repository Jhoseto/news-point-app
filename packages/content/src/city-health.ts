import { CITY_SOURCE_POLICY, citySourceInRelease } from "./city-sources";

export type CityCheckState = { lastSuccessAt?: string; nextDueAt?: string; failures?: number };
export function cityCollectionHealth(state: Record<string, CityCheckState>, now = new Date()) {
  const sources = Object.entries(CITY_SOURCE_POLICY).filter(([id]) => citySourceInRelease(id)).map(([id, policy]) => {
    const check = state[id], age = now.getTime() - Date.parse(check?.lastSuccessAt ?? ""), due = Date.parse(check?.nextDueAt ?? "");
    const status = !check || !Number.isFinite(age) || !Number.isFinite(due) ? "missing"
      : age < 0 || age > policy.staleSeconds * 1000 ? "stale"
      : (check.failures ?? 0) > 0 ? "failed" : due < now.getTime() - 5 * 60_000 ? "overdue" : "healthy";
    return { id, status };
  });
  const healthySources = sources.filter(source => source.status === "healthy").length;
  return { version: 1 as const, checkedAt: now.toISOString(), status: healthySources === sources.length ? "ok" : "degraded", expectedSources: sources.length, healthySources, sources };
}
