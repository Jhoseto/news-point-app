import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ staff: vi.fn(), read: vi.fn(), share: vi.fn(), evidence: vi.fn(), db: {} }));
vi.mock("../../../../../lib/session", () => ({ staffFromRequest: mocks.staff }));
vi.mock("../../../../../lib/auth", () => ({ studioOrigins: () => ({ trusted: ["https://studio.test"] }) }));
vi.mock("../../../../../lib/articles", () => ({ EditorError: class extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
} }));
vi.mock("../../../../../lib/audit-context", () => ({ auditEvidence: mocks.evidence }));
vi.mock("@newspoint/db", () => ({ getDb: () => mocks.db }));
vi.mock("@newspoint/db/social-publishing", () => ({
  readPodcastSocialStatus: mocks.read, sharePodcastToFacebook: mocks.share,
  PodcastSocialError: class extends Error { constructor(public status: number, public code: string, message: string) { super(message); } },
}));

import { PodcastSocialError } from "@newspoint/db/social-publishing";
import { GET, POST } from "./route";
import { auditDescriptor } from "../../../../../lib/audit-metadata";

const id = "618a7377-9e0e-4efa-b5b8-4c3688677236";
const context = (value = id) => ({ params: Promise.resolve({ id: value }) });
const url = `https://studio.test/api/podcasts/${id}/social/`;
const status = { ready: true, connected: true, enabled: true, job: { id: "fixture-job", status: "pending", step: "prepare", text: "Fixture caption", message: "Подкастът изчаква споделяне.", canRetry: false, url: null } };
const request = (body: unknown = { action: "share", revision: 3 }, origin = "https://studio.test") => new Request(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.staff.mockResolvedValue({ id: "fixture-editor", role: "editor", name: "Fixture editor" });
  mocks.read.mockResolvedValue(status);
  mocks.share.mockResolvedValue(status);
});

it("reads private status without queueing or publishing anything", async () => {
  const response = await GET(new Request(url), context());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual(status);
  expect(mocks.read).toHaveBeenCalledWith(mocks.db, id);
  expect(mocks.share).not.toHaveBeenCalled();
});

it("requires authenticated editorial access for reads and writes", async () => {
  mocks.staff.mockResolvedValue(null);
  expect((await GET(new Request(url), context())).status).toBe(401);
  expect((await POST(request(), context())).status).toBe(401);
  mocks.staff.mockResolvedValue({ id: "fixture-reader", role: "reader" });
  expect((await GET(new Request(url), context())).status).toBe(403);
  expect((await POST(request(), context())).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.share).not.toHaveBeenCalled();
});

it("rejects foreign origins, invalid ids and untrusted publishing fields", async () => {
  expect((await POST(request(undefined, "https://other.test"), context())).status).toBe(403);
  expect((await POST(request(), context("invalid"))).status).toBe(404);
  expect((await GET(new Request(url), context("invalid"))).status).toBe(404);
  for (const body of [
    { action: "share", revision: 0 }, { action: "publish", revision: 3 }, { action: "share" },
    { action: "share", revision: 3, pageId: "untrusted" },
    { action: "share", revision: 3, articleUrl: "https://evil.test/", text: "injected" },
  ]) expect((await POST(request(body), context())).status).toBe(400);
  expect(mocks.share).not.toHaveBeenCalled();
});

it("queues only an explicit share and records accepted rather than published", async () => {
  const response = await POST(request(), context());
  expect(response.status).toBe(202);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual(status);
  expect(mocks.share).toHaveBeenCalledExactlyOnceWith(mocks.db, id, 3, "share");
  expect(mocks.evidence).toHaveBeenCalledWith(null, { podcastId: id, revision: 3, action: "share", jobId: "fixture-job", status: "pending" });
});

it("passes retry as a distinct action with the current revision", async () => {
  expect((await POST(request({ action: "retry", revision: 4 }), context())).status).toBe(202);
  expect(mocks.share).toHaveBeenCalledExactlyOnceWith(mocks.db, id, 4, "retry");
});

it.each([404, 409, 422, 503] as const)("preserves domain failure %i without claiming success", async (code) => {
  const error = new PodcastSocialError(code, "fixture_error", "Контролирана грешка.");
  mocks.share.mockRejectedValueOnce(error);
  const response = await POST(request(), context());
  expect(response.status).toBe(code);
  expect((await response.json()).error).toMatchObject({ code: "fixture_error", message: "Контролирана грешка." });
  expect(mocks.evidence).not.toHaveBeenCalled();
  mocks.read.mockRejectedValueOnce(error);
  expect((await GET(new Request(url), context())).status).toBe(code);
});

it("redacts unexpected database or provider errors", async () => {
  mocks.share.mockRejectedValueOnce(new Error("private provider details"));
  mocks.read.mockRejectedValueOnce(new Error("private database details"));
  for (const response of [await POST(request(), context()), await GET(new Request(url), context())]) {
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
  }
});

it("attributes both share and retry to the podcast in the audit log", () => {
  expect(auditDescriptor(`/admin/api/podcasts/${id}/social/`, "POST", { action: "share" })).toMatchObject({ area: "podcasts", entityId: id, action: "podcasts.shareFacebook" });
  expect(auditDescriptor(`/admin/api/podcasts/${id}/social/`, "POST", { action: "retry" })).toMatchObject({ area: "podcasts", entityId: id, action: "podcasts.retryFacebook" });
  expect(auditDescriptor(`/admin/api/podcasts/${id}/social/`, "GET", {})).toMatchObject({ area: "podcasts", entityId: id, action: "podcasts.read" });
});
