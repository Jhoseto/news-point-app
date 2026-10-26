import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

const headers = { "Cache-Control": "private, no-store" };
const healthSchema = z.object({ version: z.literal(1), checkedAt: z.iso.datetime(), status: z.enum(["ok", "degraded"]), expectedSources: z.number().int().positive(), healthySources: z.number().int().nonnegative(), sources: z.array(z.object({ id: z.string().max(150), status: z.enum(["missing", "stale", "failed", "overdue", "healthy"]) })).max(100) });
export async function GET(request: Request) {
  const expected = process.env.REVALIDATE_SECRET, provided = request.headers.get("x-revalidate-secret");
  if (!expected || expected.length < 32 || !provided || provided.length > 512 || Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const storage = process.env.CITY_GUIDE_STORAGE_DIR;
  if (!storage || !isAbsolute(storage)) return Response.json({ status: "not-configured" }, { status: 503, headers });
  try {
    const raw = await readFile(resolve(storage, "collector-health.json"), "utf8");
    if (raw.length > 100_000) throw new Error("oversized health file");
    const health = healthSchema.parse(JSON.parse(raw));
    const age = Date.now() - Date.parse(health.checkedAt);
    if (age < 0 || age > 10 * 60_000) return Response.json({ status: "collector-stopped", checkedAt: health.checkedAt }, { status: 503, headers });
    return Response.json(health, { status: health.status === "ok" ? 200 : 503, headers });
  } catch { return Response.json({ status: "unavailable" }, { status: 503, headers }); }
}
