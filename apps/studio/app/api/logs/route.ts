import { withStaffAudit } from "../../../lib/audit";
import { staffFromRequest } from "../../../lib/session";
import { canReadLogs } from "../../../lib/editor/roles";
import { auditCsv, auditFilters, readAudit } from "../../../lib/audit-query";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };
async function handleGET(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: "Влезте отново." }, { status: 401, headers });
  if (!canReadLogs(staff.role)) return Response.json({ error: "Нямате достъп до Logs." }, { status: 403, headers });
  const params = new URL(request.url).searchParams;
  const exporting = params.get("export") === "csv";
  try {
    const data = await readAudit(auditFilters(params), exporting ? 10_000 : undefined);
    if (exporting && !data.ready) return Response.json({ error: "Историята още не е активирана." }, { status: 503, headers });
    if (exporting) return new Response(auditCsv(data.rows), { headers: { ...headers, "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="newspoint-logs.csv"' } });
    return Response.json(data, { headers });
  } catch (error) {
    const limit = error instanceof Error && error.message === "audit_export_limit";
    return Response.json({ error: limit ? "Изберете по-тесни филтри за износ до 10 000 записа и 32 MB детайли." : "Историята е временно недостъпна. Опитайте отново." }, { status: limit ? 422 : 503, headers });
  }
}
export const GET = withStaffAudit(handleGET);
