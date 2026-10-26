import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), read: vi.fn() }));
vi.mock("../../../../lib/city-guide/local-observations", () => ({ loadCityObservations: mocks.load }));
vi.mock("../../../../lib/city-guide/procedure-file", () => ({ readProcedureFile: mocks.read }));
import { GET } from "./route";

const hash = "a".repeat(64);
const document = { hash, title: "Explicit QA fixture", pages: 1, text: "QA ".repeat(40) };
const group = { sourceId: "plovdiv-management-competitions", status: "observed", items: [{ key: "fixture", fields: { documents: JSON.stringify([document]) } }] };
const request = (digest = hash) => new Request(`http://localhost/api/city-guide/document?sourceId=${group.sourceId}&recordKey=fixture&hash=${digest}`);
beforeEach(() => { vi.stubEnv("NODE_ENV", "development"); mocks.load.mockReset().mockResolvedValue([group]); mocks.read.mockReset().mockResolvedValue(new TextEncoder().encode("%PDF-QA")); });
afterEach(() => vi.unstubAllEnvs());
it("serves a current attached file privately without navigating to the publisher", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-disposition")).toContain("attachment;"); expect(await response.text()).toBe("%PDF-QA");
});
it("refuses stale records, unassociated files, path traversal and production previews", async () => {
  expect((await GET(request("../secrets"))).status).toBe(404);
  expect((await GET(request("b".repeat(64)))).status).toBe(404);
  mocks.load.mockResolvedValue([{ ...group, status: "stale" }]); expect((await GET(request())).status).toBe(404);
  vi.stubEnv("NODE_ENV", "production"); expect((await GET(request())).status).toBe(404);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("does not offer missing or corrupted archive bytes", async () => {
  mocks.read.mockResolvedValue(null); expect((await GET(request())).status).toBe(404);
});
it("resolves a childcare calendar only within the education category", async () => {
  mocks.load.mockResolvedValue([{ ...group, sourceId: "dz-admission-calendar" }]);
  const response = await GET(new Request(request().url.replace(group.sourceId, "dz-admission-calendar")));
  expect(response.status).toBe(200);
  expect(mocks.load).toHaveBeenCalledWith("education");
});
it("resolves an entry-permit document only within transport", async () => {
  mocks.load.mockResolvedValue([{ ...group, sourceId: "plovdiv-low-emission-permit" }]);
  expect((await GET(new Request(request().url.replace(group.sourceId, "plovdiv-low-emission-permit")))).status).toBe(200);
  expect(mocks.load).toHaveBeenCalledWith("transport");
});
