import type { PilotSnapshot } from "./parse";

export type LocalPreviewSource = {
  checkedAt: string;
  outcome: "observed" | "unavailable";
  completeness: "complete" | "uncertain";
  limitations: string[];
  items: { key: string; fields: Record<string, string | number> }[];
};

export type LocalPreview = { version: 1; sources: Record<string, LocalPreviewSource> };

/** A failed check hides records from the local UI. The pilot's hash journal remains separate. */
export function previewAfterCheck(
  previous: LocalPreviewSource | undefined,
  checkedAt: string,
  outcome: unknown,
  snapshot?: PilotSnapshot,
): LocalPreviewSource {
  if (outcome === "parsed" && snapshot) {
    return {
      checkedAt,
      outcome: "observed",
      completeness: snapshot.completeness,
      limitations: snapshot.limitations,
      items: snapshot.items.map(({ key, fields }) => ({ key, fields })),
    };
  }
  if (outcome === "unchanged" && previous?.outcome === "observed") {
    return { ...previous, checkedAt };
  }
  return { checkedAt, outcome: "unavailable", completeness: "uncertain", limitations: [], items: [] };
}
