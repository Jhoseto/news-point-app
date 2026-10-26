import { loadCityObservations } from "../../../../lib/city-guide/local-observations";
import { cityTimetable } from "../../../../lib/city-guide/timetable";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const missing = () => new Response(null, { status: 404, headers });
  if (process.env.NODE_ENV !== "development") return missing();
  const key = new URL(request.url).searchParams.get("line") ?? "";
  if (!key || key.length > 64) return missing();
  const group = (await loadCityObservations("transport")).find(group => group.sourceId === "plovdiv-livetransport-gtfs" && group.status === "observed");
  const row = group?.items.find(item => item.key === key);
  const timetable = cityTimetable(row?.fields.timetable);
  if (!row || !timetable) return missing();
  return Response.json({ serviceDate: row.fields.serviceDate, checkedAt: group!.checkedAt, timetable }, { headers });
}
