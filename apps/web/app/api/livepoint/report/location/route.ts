import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { tomtomApiKey } from "@/lib/livepoint/config";
import { reportPositionSchema } from "@/lib/livepoint/forms/location";
import { hashIp } from "@/lib/livepoint/serialize";

export const dynamic = "force-dynamic";
const buckets = new Map<string, { count: number; expires: number }>();
const addressResponse = z.object({ addresses: z.array(z.object({ address: z.object({ freeformAddress: z.string() }) })) });
const headers = { "Cache-Control": "private, no-store" };

/** Local abuse guard; a shared limiter is needed before running multiple production instances. */
function allowed(ip: string) {
  const now = Date.now();
  for (const [key, value] of buckets) if (value.expires <= now) buckets.delete(key);
  const entry = buckets.get(ip);
  if (entry) { entry.count += 1; return entry.count <= 20; }
  if (buckets.size >= 1000) return false;
  buckets.set(ip, { count: 1, expires: now + 10 * 60_000 });
  return true;
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Заявката трябва да е от сайта." }, { status: 403, headers });
  }
  if (Number(request.headers.get("content-length")) > 512) return NextResponse.json({ error: "Твърде голяма заявка." }, { status: 413, headers });
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 512) return NextResponse.json({ error: "Твърде голяма заявка." }, { status: 413, headers });
    input = JSON.parse(body);
  } catch { return NextResponse.json({ error: "Невалидна точка." }, { status: 400, headers }); }
  const parsed = reportPositionSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Невалидни координати." }, { status: 400, headers });
  const key = tomtomApiKey();
  if (!key) return NextResponse.json({ error: "Адресът не може да се намери в момента." }, { status: 503, headers });
  const ip = hashIp(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null) ?? "local";
  if (!allowed(ip)) return NextResponse.json({ error: "Твърде много заявки за адрес. Изчакайте или уточнете мястото ръчно." }, { status: 429, headers: { ...headers, "Retry-After": "600" } });
  const { lat, lon } = parsed.data;
  const url = new URL(`https://api.tomtom.com/search/2/reverseGeocode/${lat.toFixed(6)},${lon.toFixed(6)}.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "bg-BG");
  url.searchParams.set("radius", "100");
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]) });
    if (!response.ok) throw new Error("Address unavailable");
    const data = addressResponse.safeParse(await response.json());
    const address = data.success ? data.data.addresses[0]?.address.freeformAddress.trim().slice(0, 200) : null;
    return NextResponse.json({ address: address || null }, { headers });
  } catch {
    return NextResponse.json({ error: "Адресът не може да се намери в момента. Точката остава избрана." }, { status: 502, headers });
  }
}
