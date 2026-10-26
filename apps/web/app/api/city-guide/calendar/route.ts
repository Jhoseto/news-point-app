import { loadCityObservations } from "../../../../lib/city-guide/local-observations";
import { cityDeadlineCalendar } from "../../../../lib/city-guide/calendar";

const allowed = new Set(["plovdiv-tax-notices", "plovdiv-public-consultations", "plovdiv-management-competitions", "plovdiv-auction-list"]);
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404, headers });
  const params = new URL(request.url).searchParams;
  const sourceId = params.get("sourceId") ?? "";
  const recordKey = params.get("recordKey") ?? "";
  if (!allowed.has(sourceId) || !recordKey || recordKey.length > 500) return new Response(null, { status: 404, headers });
  const group = (await loadCityObservations("municipality")).find(entry => entry.sourceId === sourceId && entry.status === "observed");
  const record = group?.items.find(item => item.key === recordKey);
  if (!record) return new Response(null, { status: 404, headers });
  const { fields } = record;
  const deadline = String(fields.dueDate ?? fields.deadline ?? "");
  const title = String(fields.label ?? fields.title ?? fields.company ?? "");
  if (!title || !deadline) return new Response(null, { status: 404, headers });
  return new Response(cityDeadlineCalendar(title, deadline), { headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="moyat-plovdiv-${deadline}.ics"` } });
}
