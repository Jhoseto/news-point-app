const RUBRICS_KEY = "np-push-rubric-slugs";
const MASTER_KEY = "np-push-master";

export function readPushMasterEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(MASTER_KEY);
    if (raw === "0") return false;
  } catch {
    // ignore
  }
  return true;
}

export function writePushMasterEnabled(on: boolean) {
  try {
    localStorage.setItem(MASTER_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}

/** null = all rubrics; [] = none; otherwise the selected rubric slugs. */
export function readStoredPushRubrics(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(RUBRICS_KEY);
    if (!raw || raw === "all") return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return null;
  }
}

export function writeStoredPushRubrics(slugs: string[] | null) {
  try {
    if (slugs === null) localStorage.setItem(RUBRICS_KEY, "all");
    else localStorage.setItem(RUBRICS_KEY, JSON.stringify(slugs));
  } catch {
    // ignore
  }
}
