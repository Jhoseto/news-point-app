import { staffFromRequest } from "../../../lib/session";
import { canReadLogs } from "../../../lib/editor/roles";
import { readErrorMonitoring } from "../../../lib/error-monitoring";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
// Read-only system polling; do not fill the editorial audit table with heartbeat reads.
export async function GET(request: Request) {
  try {
    const staff = await staffFromRequest(request);
    if (!staff) return Response.json({ error: "Влезте отново." }, { status: 401, headers });
    if (!canReadLogs(staff.role)) return Response.json({ error: "Нямате достъп до Error monitoring." }, { status: 403, headers });
    const data = await readErrorMonitoring();
    if (new URL(request.url).searchParams.get("view") === "summary") {
      return Response.json({ status: data.status, checkedAt: data.checkedAt, attentionAt: data.attentionAt, activeProblem: data.activeProblem }, { headers });
    }
    return Response.json(data, { headers });
  } catch { return Response.json({ error: "Диагностиката временно не е достъпна." }, { status: 503, headers }); }
}
