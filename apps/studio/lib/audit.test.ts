import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditFixture } from "../../../tests/studio/audit-fixtures";
import type { Staff } from "./session";
import type { AuditEntry } from "./audit-types";
const mocks = vi.hoisted(() => ({ staff: vi.fn(), persist: vi.fn(), snapshot: vi.fn(), labels: vi.fn() }));
vi.unmock("./audit");
vi.mock("./session", () => ({ staffFromRequest: mocks.staff }));
vi.mock("./audit-store", () => ({ persistAudit: mocks.persist }));
vi.mock("./audit-snapshots", async importOriginal => ({ ...await importOriginal<typeof import("./audit-snapshots")>(), auditSnapshot: mocks.snapshot, auditArticleLabels: mocks.labels }));
import { auditRequestInput, withStaffAudit } from "./audit";
import { auditEvidence, auditFacts, identifyAuditActor } from "./audit-context";
import { auditChanges, auditDescriptor, safeAuditInput } from "./audit-metadata";
const actor: Staff = { id: "qa-editor", name: "QA редактор", email: "qa@example.test", role: "editor" };
const articleId = auditFixture().entityId;
const request = (body: unknown = {}, path = `/editor/articles/${articleId}/revisions`, method = "POST") => new Request(`http://studio.test/admin/api${path}/`, { method, ...(method === "GET" ? {} : { body: JSON.stringify(body) }), headers: { "content-type": "application/json", "x-real-ip": "127.0.0.1" } });
beforeEach(() => { vi.clearAllMocks(); mocks.staff.mockResolvedValue(actor); mocks.persist.mockResolvedValue(true); mocks.snapshot.mockResolvedValue(null); mocks.labels.mockResolvedValue({}); });

describe("Server audit boundary", () => {
  it("keeps the original body and response and records exact domain changes with verified staff", async () => {
    const handler = vi.fn(async (req: Request) => {
      expect(await req.json()).toMatchObject({ actorId: "forged", draft: { title: "Новото" } });
      auditEvidence({ title: "Старото", body: "стар текст" }, { title: "Новото", body: "нов текст" });
      return Response.json({ revision: 8 });
    });
    const result = await withStaffAudit(handler)(request({ actorId: "forged", password: "SECRET", expectedRevision: 7, draft: { title: "Новото" } }));
    expect(await result.json()).toEqual({ revision: 8 });
    const [start, finish] = mocks.persist.mock.calls.map(call => call[0] as AuditEntry);
    expect(start?.outcome).toBe("pending"); expect(finish?.outcome).toBe("success"); expect(start?.id).toBe(finish?.id);
    expect(finish).toMatchObject({ actorId: actor.id, actorRole: "editor", statusCode: 200, entityId: articleId });
    expect(finish?.details.changes).toEqual([{ field: "title", before: "Старото", after: "Новото" }, { field: "body", before: "стар текст", after: "нов текст" }]);
    expect(JSON.stringify(finish)).not.toContain("SECRET"); expect(JSON.stringify(finish)).not.toContain("forged");
  });
  it("preserves authorization failure and does not report rejected changes as applied", async () => {
    const response = await withStaffAudit(async () => Response.json({ error: { code: "forbidden", message: "hidden" } }, { status: 403 }))(request({ role: "master_admin" }, "/staff/qa-target", "PATCH"));
    expect(response.status).toBe(403); expect(mocks.persist.mock.calls[1]?.[0]).toMatchObject({ outcome: "failure", statusCode: 403, details: { errorCode: "forbidden" } });
    expect(mocks.persist.mock.calls[1]?.[0].details.changes).toBeUndefined();
  });
  it("records an exception and rethrows the original exception", async () => {
    const failure = new Error("private connection string");
    await expect(withStaffAudit(async () => { throw failure; })(request())).rejects.toBe(failure);
    expect(mocks.persist.mock.calls[1]?.[0]).toMatchObject({ outcome: "failure", statusCode: 500 });
    expect(JSON.stringify(mocks.persist.mock.calls)).not.toContain("private connection");
  });
  it("blocks a mutation before running it when neither database nor private buffer can record it", async () => {
    mocks.persist.mockResolvedValue(false); const handler = vi.fn(async () => Response.json({ ok: true }));
    const result = await withStaffAudit(handler)(request()); expect(result.status).toBe(503); expect(handler).not.toHaveBeenCalled();
  });
  it("attributes a successful login using the trusted auth hook and never records response tokens", async () => {
    mocks.staff.mockResolvedValue(null);
    await withStaffAudit(async () => { identifyAuditActor(actor); return Response.json({ token: "TOKEN_SECRET", user: actor }); })(request({ email: actor.email, password: "PASSWORD_SECRET" }, "/auth/sign-in/email"));
    expect(mocks.persist.mock.calls[0]?.[0].actorId).toBeNull(); expect(mocks.persist.mock.calls[1]?.[0].actorId).toBe(actor.id);
    expect(JSON.stringify(mocks.persist.mock.calls)).not.toMatch(/TOKEN_SECRET|PASSWORD_SECRET/);
  });
  it("does not clone or consume a multipart upload and accepts trusted upload evidence", async () => {
    const form = new FormData(); form.set("photo", new File(["QA"], "fixture.png", { type: "image/png" }));
    const req = new Request("http://studio.test/admin/api/profile/photo/", { method: "POST", body: form });
    await withStaffAudit(async original => { expect((await original.formData()).get("photo")).toBeInstanceOf(File); auditFacts({ entityLabel: "QA снимка", bytes: 2 }); return Response.json({ ok: true }); })(req);
    expect(mocks.persist.mock.calls[1]?.[0]).toMatchObject({ action: "profile.uploadPhoto", details: { bytes: 2 }, entityLabel: "QA снимка" });
  });
  it("preserves the initiating account when an already authenticated employee signs into a different account", async () => {
    const next = { ...actor, id: "qa-other", email: "other@example.test" };
    await withStaffAudit(async () => { identifyAuditActor(next); return Response.json({ ok: true }); })(request({ email: next.email }, "/auth/sign-in/email"));
    expect(mocks.persist.mock.calls[1]?.[0]).toMatchObject({ actorId: actor.id, details: { authenticatedAccount: { id: next.id } } });
  });
  it("keeps read handlers available even when the audit store is offline", async () => {
    mocks.persist.mockResolvedValue(false);
    expect((await withStaffAudit(async () => Response.json({ ok: true }))(request({}, "/polls", "GET"))).status).toBe(200);
  });
  it("bounded metadata reads leave oversized JSON available to the original handler", async () => {
    const req = request({ note: "a".repeat(600_000) });
    expect(await auditRequestInput(req)).toEqual({}); expect((await req.json()).note).toHaveLength(600_000);
  });
  it("records a session-store outage in recovery without inventing an employee identity", async () => {
    const failure = new Error("QA session outage"); mocks.staff.mockRejectedValue(failure);
    const handler = vi.fn(async () => Response.json({ ok: true }));
    await expect(withStaffAudit(handler)(request())).rejects.toBe(failure);
    expect(handler).not.toHaveBeenCalled(); expect(mocks.persist.mock.calls[1]?.[0]).toMatchObject({ actorId: null, outcome: "failure", statusCode: 500 });
  });
  it("does not let a forged content length hide the action metadata", async () => {
    const req = new Request("http://studio.test/admin/api/stories/", { method: "POST", headers: { "content-type": "application/json", "content-length": "9999999" }, body: JSON.stringify({ action: "publish", id: articleId }) });
    expect(await auditRequestInput(req)).toEqual({ action: "publish", id: articleId });
    expect(await req.json()).toEqual({ action: "publish", id: articleId });
  });
});
describe("Exact editorial metadata", () => {
  it("recognizes all important operations and nested poll IDs", () => {
    expect(auditDescriptor("/admin/api/arrangements/", "POST", { action: "place", pageKey: "home" })).toMatchObject({ area: "arrangements", verb: "place", entityId: "home" });
    expect(auditDescriptor("/api/polls", "POST", { action: "correct", input: { id: articleId } })).toMatchObject({ action: "polls.correct", entityId: articleId });
    expect(auditDescriptor("/api/stories", "POST", { action: "replaceArticles", themeId: articleId })).toMatchObject({ action: "stories.replaceArticles" });
    expect(auditDescriptor(`/admin/api/uploads/${articleId}/cancel/`, "POST", {})).toMatchObject({ action: "navigation.cancel", actionLabel: "Отказ на задача" });
  });
  it("retains placement queue order, deadlines, exclusions and full changed text", () => {
    const before = { slots: { lead: { items: [{ articleId, endsAt: null }] } }, excluded: [] };
    const after = { slots: { lead: { items: [{ articleId, endsAt: "2026-10-12T12:00Z" }, { articleId: "another", endsAt: null }] } }, excluded: ["third"] };
    expect(auditChanges(before, after)).toHaveLength(2);
    expect(auditChanges(before, after)[0]).toMatchObject({ field: "slots.lead.items", before: before.slots.lead.items, after: after.slots.lead.items });
    expect(auditChanges({ body: "old" }, { body: "new" })).toEqual([{ field: "body", before: "old", after: "new" }]);
  });
  it("does not accept arbitrary private reader data or credentials", () => {
    expect(safeAuditInput({ status: "verified", password: "x", contact: "reader", payload: { text: "private" }, token: "t", cookie: "c" })).toEqual({ status: "verified" });
  });
  it("redacts password reset tokens in both path and action", () => {
    const descriptor = auditDescriptor("/admin/api/auth/reset-password/SECRET_TOKEN/", "GET", {});
    expect(JSON.stringify(descriptor)).not.toContain("SECRET_TOKEN"); expect(descriptor.action).toBe("auth.reset-password");
  });
});
