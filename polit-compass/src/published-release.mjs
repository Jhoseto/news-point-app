import { compareChoiceParties } from "./choice-engine.mjs";

function indexedRows(rows) {
  if (!Array.isArray(rows)) throw new Error("Invalid public registry");
  const ids = new Set(rows.map((row) => row?.id));
  if (ids.size !== rows.length || [...ids].some((id) => typeof id !== "string" || !id)) {
    throw new Error("Invalid public registry IDs");
  }
  return ids;
}

export function validatePublishedRelease(data, baseline, questions) {
  const { release, snapshot, sources, evidence, entities } = data;
  const current = baseline.release;
  if (!release?.id || !snapshot?.id || !snapshot.version ||
      release.responseFormat !== current.responseFormat ||
      release.questionVersion !== current.questionVersion ||
      release.reportVersion !== current.reportVersion ||
      release.scoringVersion !== current.scoringVersion ||
      release.partyDatasetVersion !== snapshot.version ||
      snapshot.questionSetVersion !== release.questionVersion ||
      !Array.isArray(snapshot.comparisonCoreIds) || typeof release.partyRankingEnabled !== "boolean") {
    throw new Error("Incompatible public release");
  }
  const sourceIds = indexedRows(sources);
  indexedRows(evidence);
  const entityIds = indexedRows(entities);
  const evidenceById = new Map(evidence.map((row) => [row.id, row]));
  if (evidence.some((row) => !sourceIds.has(row.sourceId) || !entityIds.has(row.entityId) ||
      !Array.isArray(row.questionIds))) {
    throw new Error("Unresolved published evidence");
  }
  const check = compareChoiceParties({ choices: {}, questions, snapshot });
  if (!check.coreValid || check.invalidCells.length) throw new Error("Invalid published positions");
  for (const party of snapshot.parties) {
    if (!entityIds.has(party.id)) throw new Error("Unknown published entity");
    for (const [questionId, cell] of Object.entries(party.positions ?? {})) {
      if (cell?.status !== "approved") continue;
      for (const id of cell.evidenceIds) {
        const record = evidenceById.get(id);
        if (!record || record.entityId !== party.id || !record.questionIds.includes(questionId)) {
          throw new Error("Unresolved published evidence");
        }
      }
    }
  }
  return { release, snapshot, sources, evidence, entities };
}

export async function loadPublishedRelease({ baseline, questions, signal, request = fetch }) {
  try {
    const response = await request("/polit-compass/api/public/release/", {
      signal, cache: "no-store", credentials: "omit",
      headers: { "If-None-Match": '"' + baseline.release.id + '"' },
    });
    if (response.status === 304) return { ...baseline, loading: false, fallback: false };
    if (!response.ok) throw new Error("Public release unavailable");
    const data = validatePublishedRelease(await response.json(), baseline, questions);
    return { ...data, loading: false, fallback: false };
  } catch {
    return { ...baseline, loading: false, fallback: true };
  }
}
