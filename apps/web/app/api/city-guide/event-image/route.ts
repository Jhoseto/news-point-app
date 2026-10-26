import { cityStorageDirectories } from "../../../../lib/city-guide/storage";
import { cityGuideEnabled } from "../../../../lib/city-guide/access";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadCityObservations } from "@/lib/city-guide/local-observations";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const missing = () => new Response(null, { status: 404, headers });
  if (!cityGuideEnabled()) return missing();
  const p = new URL(request.url).searchParams, category = p.get("category") ?? "", hash = p.get("hash") ?? "";
  if (!["culture", "nightlife", "adopt"].includes(category) || !/^[a-f0-9]{64}$/u.test(hash) || (p.get("recordKey")?.length ?? 0) > 1000) return missing();
  const group = (await loadCityObservations(category)).find(g => g.sourceId === p.get("sourceId") && g.status === "observed");
  if (!group?.items.some(item => item.key === p.get("recordKey") && item.fields.imageHash === hash)) return missing();
  const dirs = cityStorageDirectories("event-images");
  for (const dir of dirs) {
    try {
      const bytes = await readFile(resolve(dir, `${hash}.webp`));
      if (bytes.length > 12_000_000 || createHash("sha256").update(bytes).digest("hex") !== hash || bytes.subarray(8, 12).toString() !== "WEBP") return missing();
      return new Response(new Uint8Array(bytes).buffer, { headers: { ...headers, "Content-Type": "image/webp" } });
    } catch { /* Try the other monorepo working directory. */ }
  }
  return missing();
}
