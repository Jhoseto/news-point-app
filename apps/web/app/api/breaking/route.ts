import { getDb, readPublicBreaking } from "@newspoint/db";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "cache-control": "no-store" };
  try { return Response.json({ bulletin: await readPublicBreaking(getDb()) }, { headers }); }
  catch { return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers }); }
}
