import { afterEach, beforeEach, expect, it, vi } from "vitest";
const load = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/city-guide/local-observations", () => ({ loadCityObservations: load }));
import { GET } from "./route";
import { departureLabel } from "../../../../lib/city-guide/timetable";
const timetable = [{ id: "qa", destination: "QA", stops: [{ id: "a", code: "1", name: "QA 1", times: ["24:15:00"] }, { id: "b", code: "2", name: "QA 2", times: ["24:30:00"] }] }];
const group = { sourceId: "plovdiv-livetransport-gtfs", status: "observed", checkedAt: "2026-10-26T06:00:00Z", items: [{ key: "1", fields: { serviceDate: "2026-10-26", timetable: JSON.stringify(timetable) } }] };
const request = () => new Request("http://localhost/api/city-guide/transit?line=1");
beforeEach(() => { vi.stubEnv("NODE_ENV", "development"); load.mockReset().mockResolvedValue([group]); });
afterEach(() => vi.unstubAllEnvs());
it("returns a single current line privately and preserves service-day dates", async () => {
  const response = await GET(request()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ timetable, serviceDate: "2026-10-26" });
  expect(departureLabel("24:15:00")).toBe("00:15 (+1 ден)"); expect(departureLabel("06:19:33")).toBe("06:19:33");
});
it("hides stale, invalid and production schedules", async () => {
  load.mockResolvedValue([{ ...group, status: "stale" }]); expect((await GET(request())).status).toBe(404);
  load.mockResolvedValue([{ ...group, items: [{ key: "1", fields: { timetable: "[{}]" } }] }]); expect((await GET(request())).status).toBe(404);
  vi.stubEnv("NODE_ENV", "production"); load.mockClear(); expect((await GET(request())).status).toBe(404); expect(load).not.toHaveBeenCalled();
});
