import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ staff: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock("../../../lib/session", () => ({ staffFromRequest: mocks.staff }));
vi.mock("../../../lib/auth", () => ({ studioOrigins: () => ({ trusted: ["https://studio.test"] }) }));
vi.mock("@newspoint/db", async original => ({ ...await original<typeof import("@newspoint/db")>(), getDb: () => ({ fixture: true }), readBreakingSettings: mocks.read, writeBreaking: mocks.write }));
import { GET, POST } from "./route";
import { BreakingWriteError } from "@newspoint/db";
const settings = { ready: true, version: 1, enabled: false, text: "QA fixture", articleId: null, articleTitle: null };
const input = { expectedVersion: 1, enabled: true, text: "QA fixture", articleId: null };
const request = (body: unknown = input, origin = "https://studio.test") => new Request("https://studio.test/admin/api/breaking/", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.staff.mockResolvedValue({ id: "qa-editor", role: "editor" });
  mocks.read.mockResolvedValue(settings); mocks.write.mockResolvedValue({ before: settings, after: { ...settings, enabled: true, version: 2 } });
});
it("denies anonymous users, foreign origins and noneditor roles before writing", async () => {
  expect((await POST(request(input, "https://foreign.test"))).status).toBe(403);
  mocks.staff.mockResolvedValue(null);
  const read = await GET(new Request("https://studio.test/admin/api/breaking/"));
  expect(read.status).toBe(401); expect(read.headers.get("cache-control")).toBe("private, no-store");
  expect((await POST(request())).status).toBe(401);
  mocks.staff.mockResolvedValue({ id: "reader", role: "reader" });
  expect((await GET(new Request("https://studio.test/admin/api/breaking/"))).status).toBe(403);
  expect((await POST(request())).status).toBe(403); expect(mocks.write).not.toHaveBeenCalled();
});
it("rejects invalid enabled text and accepts a link-free message for editors", async () => {
  expect((await POST(request({ ...input, text: " " }))).status).toBe(400);
  expect((await POST(request({ ...input, text: "x".repeat(501) }))).status).toBe(400);
  expect(mocks.write).not.toHaveBeenCalled();
  const saved = await POST(request()); expect(saved.status).toBe(200);
  expect(saved.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.write).toHaveBeenCalledWith(expect.anything(), input, "qa-editor");
});
it("returns a recoverable409 without hiding a concurrent editor's change", async () => {
  mocks.write.mockRejectedValue(new BreakingWriteError(409, "breaking_conflict", "Презаредете настройките."));
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("breaking_conflict");
});
