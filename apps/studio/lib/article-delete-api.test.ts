import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ staff: vi.fn(), remove: vi.fn(), persist: vi.fn() }));
vi.unmock("./audit");
vi.mock("./session", () => ({ staffFromRequest: mocks.staff }));
vi.mock("./auth", () => ({ studioOrigins: () => ({ trusted: ["https://newspoint.bg"] }) }));
vi.mock("./articles", () => ({ deleteArticle: mocks.remove, EditorError: class extends Error {} }));
vi.mock("./audit-store", () => ({ persistAudit: mocks.persist }));
vi.mock("./audit-snapshots", () => ({ snapshotLabel: () => "", auditSnapshot: vi.fn().mockResolvedValue(null), auditArticleLabels: vi.fn().mockResolvedValue({}) }));
import { POST } from "../app/api/editor/articles/[id]/delete/route";
const id = "360a3346-fae0-43c2-991a-dc73728ca9c9";
const staff = { id: "editor", role: "editor", name: "QA", email: "qa@example.test" };
const call = (body: unknown = { confirm: true }, origin = "https://newspoint.bg", articleId = id) => POST(new Request(`https://newspoint.bg/admin/api/editor/articles/${articleId}/delete/`, {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: articleId }) });
beforeEach(() => { vi.clearAllMocks(); mocks.staff.mockResolvedValue(staff); mocks.remove.mockResolvedValue({ id }); mocks.persist.mockResolvedValue(true); });
describe("Explicit POST article deletion", () => {
  it("denies foreign origins, anonymous sessions and non-editor roles without deleting", async () => {
    expect((await call({ confirm: true }, "https://foreign.test")).status).toBe(403);
    mocks.staff.mockResolvedValue(null); expect((await call()).status).toBe(401);
    mocks.staff.mockResolvedValue({ ...staff, role: "reader" }); expect((await call()).status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("requires exact confirmation and a valid article id", async () => {
    for (const body of [{}, { confirm: false }, { confirm: "true" }, { confirm: true, extra: true }]) expect((await call(body)).status).toBe(400);
    expect((await call({ confirm: true }, "https://newspoint.bg", "not-an-id")).status).toBe(404);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("blocks deletion when the audit store is unavailable", async () => {
    mocks.persist.mockResolvedValue(false); expect((await call()).status).toBe(503); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("uses the existing domain operation and records deletion with the real POST method", async () => {
    const response = await call(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(staff, id);
    expect(mocks.persist.mock.calls.at(-1)?.[0]).toMatchObject({ action: "articles.delete", method: "POST", entityId: id, outcome: "success", statusCode: 200 });
  });
});
