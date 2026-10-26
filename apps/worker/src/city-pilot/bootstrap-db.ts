import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCityPilotWriter } from "@newspoint/db/city";
import { pilotSources } from "./catalog";
import { pilotRefreshSeconds } from "./run";
import type { LocalPreview } from "./preview";

const outputDir = resolve(process.env.CITY_PILOT_OUTPUT_DIR || resolve(import.meta.dirname, "../../../../tests/reports/city-preview-live"));
const preview = JSON.parse(await readFile(resolve(outputDir, "preview.json"), "utf8")) as LocalPreview;
const state = JSON.parse(await readFile(resolve(outputDir, "state.json"), "utf8")) as {
  sources: Record<string, { items: Record<string, string> }>;
};
if (preview.version !== 1 || !preview.sources || !state.sources) throw new Error("Invalid pilot evidence");

const writer = createCityPilotWriter();
try {
  for (const source of pilotSources) {
    const view = preview.sources[source.id];
    if (!view) continue;
    const observed = view.outcome === "observed";
    const hashes = state.sources[source.id]?.items ?? {};
    const items = observed ? view.items.map(entry => {
      const fingerprint = hashes[entry.key];
      if (!fingerprint) throw new Error(`${source.id}: missing fingerprint for ${entry.key}`);
      return { key: entry.key, fingerprint, fields: entry.fields };
    }) : undefined;
    const result = await writer.write({
      source,
      checkedAt: view.checkedAt,
      outcome: observed ? "parsed" : "failed",
      refreshSeconds: pilotRefreshSeconds(source.id),
      ...(items ? { items } : {}),
      ...(!observed ? { error: "Local pilot unavailable at bootstrap" } : {}),
    });
    process.stdout.write(`${source.id}: ${observed ? `${items?.length} shadow records` : "unavailable"}, ${result.added} added\n`);
  }
} finally {
  await writer.close();
}
