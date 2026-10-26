export type CityRecord = {
  key: string;
  fingerprint: string;
  fields: Record<string, string | number>;
};
export type StoredCityRecord = CityRecord & { state: "current" | "missing" };
export type CityRecordChange = CityRecord & { kind: "first" | "changed" | "returned" | "missing" };

/** A failed or unchanged fetch never calls this: absence is meaningful only after a complete parse. */
export function diffCityRecords(previous: StoredCityRecord[], current: CityRecord[]): {
  versions: CityRecordChange[];
  missingKeys: string[];
  added: number;
  changed: number;
  missing: number;
} {
  const before = new Map(previous.map(record => [record.key, record]));
  const seen = new Set<string>();
  const versions: CityRecordChange[] = [];
  let added = 0;
  let changed = 0;
  for (const record of current) {
    if (seen.has(record.key)) throw new Error(`Duplicate city record key: ${record.key}`);
    seen.add(record.key);
    const old = before.get(record.key);
    const kind = !old ? "first" : old.state === "missing" ? "returned" : old.fingerprint !== record.fingerprint ? "changed" : null;
    if (!old) added++;
    else if (kind) changed++;
    if (kind) versions.push({ ...record, kind });
  }
  const missingKeys: string[] = [];
  for (const old of previous) {
    if (old.state !== "current" || seen.has(old.key)) continue;
    missingKeys.push(old.key);
    versions.push({ ...old, kind: "missing" });
  }
  return { versions, missingKeys, added, changed, missing: missingKeys.length };
}
