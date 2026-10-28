import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  staff: vi.fn(), retry: vi.fn(), status: vi.fn(), persist: vi.fn(), article: vi.fn(),
}));
vi.unmock("./audit");
vi.mock("./session", () => ({ staffFromRequest: mocks.staff }));
vi.mock("./auth", () => ({ studioOrigins: () => ({ trusted: ["https://newspoint.bg"] }) }));
vi.mock("./articles", () => ({ EditorError: class extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
} }));
vi.mock("./audit-store", () => ({ persistAudit: mocks.persist }));
vi.mock("./audit-snapshots", () => ({ snapshotLabel: () => "", auditSnapshot: vi.fn().mockResolvedValue(null), auditArticleLabels: vi.fn().mockResolvedValue({}) }));
vi.mock("@newspoint/db/instagram-publishing", () => ({ readInstagramStatus: mocks.status, retryInstagramPublication: mocks.retry }));
vi.mock("@newspoint/db", () => ({
  articles: { id: "id" },
  getDb: () => ({ select: () => ({ from: () => ({ where: mocks.article }) }) }),
}));

import { GET, POST } from "../app/api/editor/articles/[id]/instagram/route";
const id = "360a3346-fae0-43c2-991a-dc73728ca9c9";
const staff = { id: "editor", role: "editor", name: "QA", email: "qa@example.test" };
const state = { ready: true, connected: true, enabled: true, job: null };
const call = (body: unknown = { action: "retry" }, origin = "https://newspoint.bg", articleId = id) => POST(new Request(`https://newspoint.bg/admin/api/editor/articles/${articleId}/instagram/`, {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: articleId }) });
const read = (articleId = id) => GET(new Request(`https://newspoint.bg/admin/api/editor/articles/${articleId}/instagram/`), { params: Promise.resolve({ id: articleId }) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.staff.mockResolvedValue(staff); mocks.retry.mockResolvedValue(true);
  mocks.status.mockResolvedValue(state); mocks.persist.mockResolvedValue(true); mocks.article.mockResolvedValue([{ id }]);
});

describe("Instagram editorial endpoint", () => {
  it("blocks cross-origin, unauthenticated and non-editor retry requests", async () => {
    expect((await call({ action: "retry" }, "https://foreign.test")).status).toBe(403);
    mocks.staff.mockResolvedValue(null); expect((await call()).status).toBe(401);
    mocks.staff.mockResolvedValue({ ...staff, role: "reader" }); expect((await call()).status).toBe(403);
    expect(mocks.retry).not.toHaveBeenCalled();
  });
  it("rejects arbitrary actions, payload fields and invalid article identifiers", async () => {
    for (const body of [{}, { action: "publish" }, { action: "retry", accountId: "another-account" }]) expect((await call(body)).status).toBe(400);
    expect((await call({ action: "retry" }, "https://newspoint.bg", "not-an-id")).status).toBe(422);
    expect(mocks.retry).not.toHaveBeenCalled();
  });
  it("cannot retry without a durable audit record", async () => {
    mocks.persist.mockResolvedValue(false); expect((await call()).status).toBe(503);
    expect(mocks.retry).not.toHaveBeenCalled();
  });
  it("returns a safe refusal when the domain operation rejects an uncertain or completed post", async () => {
    mocks.retry.mockResolvedValue(false); expect((await call()).status).toBe(422);
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("accepts an authorized retry and records the real action without caching", async () => {
    const response = await call(); expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual(state); expect(mocks.retry).toHaveBeenCalledTimes(1);
    expect(mocks.persist.mock.calls.at(-1)?.[0]).toMatchObject({ method: "POST", entityId: id, outcome: "success", statusCode: 202 });
  });
  it("protects status from anonymous requests and validates article existence", async () => {
    mocks.staff.mockResolvedValue(null); expect((await read()).status).toBe(401); expect(mocks.status).not.toHaveBeenCalled();
    mocks.staff.mockResolvedValue(staff); expect((await read("invalid")).status).toBe(404);
    mocks.article.mockResolvedValue([]); expect((await read()).status).toBe(404);
    mocks.article.mockResolvedValue([{ id }]); const response = await read();
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(state);
  });
});
