import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/audit", () => ({ withStaffAudit: (handler: unknown) => handler }));
const mocks = vi.hoisted(() => ({ staff: vi.fn() }));
vi.mock("@/lib/session", () => ({ staffFromRequest: mocks.staff }));
vi.mock("@/lib/auth", () => ({ studioOrigins: () => ({ trusted: ["https://studio.test"] }) }));
import { POST } from "./route";
beforeEach(() => mocks.staff.mockResolvedValue({ id: "editor", role: "editor" }));
it("retired multipart endpoint tells old tabs to refresh without reading the body", async () => {
 const request = new Request("https://studio.test/admin/api/podcasts/upload/", { method: "POST", headers: { origin: "https://studio.test", "content-length": "125829120" }, body: "unread" });
 const read = vi.spyOn(request, "formData"); const response = await POST(request);
 expect(response.status).toBe(409); expect((await response.json()).error.code).toBe("upload_protocol_changed"); expect(read).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("retired endpoint still rejects foreign origins and anonymous sessions", async () => {
 expect((await POST(new Request("https://studio.test/admin/api/podcasts/upload/", { method: "POST", headers: { origin: "https://foreign.test" } }))).status).toBe(403);
 mocks.staff.mockResolvedValue(null);
 expect((await POST(new Request("https://studio.test/admin/api/podcasts/upload/", { method: "POST", headers: { origin: "https://studio.test" } }))).status).toBe(401);
});
