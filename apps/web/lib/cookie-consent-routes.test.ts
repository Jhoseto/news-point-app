import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ALL_OPTIONAL_CONSENT, NO_OPTIONAL_CONSENT, createConsent, serializeConsent } from "./cookie-consent";
import { POST as countRead } from "../app/api/articles/[id]/read/route";
import { POST as clearStatistics } from "../app/api/privacy/clear-statistics/route";

const db = vi.hoisted(() => ({ getDb: vi.fn(() => ({})), hasArticleReadCounts: vi.fn(async () => false) }));
vi.mock("@newspoint/db", () => ({ ...db, articleReadCounts: {}, articleViewBoosts: {}, articles: {}, hasArticleViewBoosts: vi.fn() }));
vi.mock("@/lib/article-read", async () => await import("./article-read"));
vi.mock("@/lib/article-read-cookie-cleanup", async () => await import("./article-read-cookie-cleanup"));
vi.mock("@/lib/cookie-consent", async () => await import("./cookie-consent"));
const id = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id }) };
function request(cookie = "", origin = "https://newspoint.bg") {
  return new NextRequest(`https://newspoint.bg/api/articles/${id}/read/`, { method: "POST", headers: { host: "newspoint.bg", origin, cookie, "sec-fetch-site": "same-origin" } });
}
beforeEach(() => vi.clearAllMocks());

for (const cookie of ["", "np_consent=broken", serializeConsent(createConsent(NO_OPTIONAL_CONSENT, "selection"), true), serializeConsent(createConsent({ preferences: true, statistics: false, external: true }, "selection"), true)]) {
  it("never touches the database or sets a read cookie without statistics consent", async () => {
    const response = await countRead(request(cookie), context);
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(db.getDb).not.toHaveBeenCalled();
  });
}
it("allows a valid statistics choice to reach the existing database-capability check", async () => {
  const response = await countRead(request(serializeConsent(createConsent(ALL_OPTIONAL_CONSENT, "all"), true)), context);
  expect(response.status).toBe(503); // Explicit isolated fixture: counts unavailable, no live data.
  expect(db.getDb).toHaveBeenCalledOnce();
  expect(db.hasArticleReadCounts).toHaveBeenCalledOnce();
});
it("expires legacy article markers without issuing replacement read cookies", async () => {
  const legacy = Array.from({ length: 160 }, (_, index) => `np_rd_00000000-0000-4000-8000-${index.toString().padStart(12, "0")}=1`).join("; ");
  const response = await countRead(request(`${serializeConsent(createConsent(ALL_OPTIONAL_CONSENT, "all"), true)}; ${legacy}`), context);
  expect(response.status).toBe(503);
  expect(response.cookies.getAll()).toHaveLength(160);
  expect(response.cookies.getAll().every(cookie => cookie.name.startsWith("np_rd_") && cookie.value === "")).toBe(true);
  expect(response.headers.get("set-cookie")).not.toContain("Max-Age=86400");
});
it("rejects foreign origins even when a consent cookie is supplied", async () => {
  const req = request(serializeConsent(createConsent(ALL_OPTIONAL_CONSENT, "all"), true), "https://other.example");
  expect((await countRead(req, context)).status).toBe(403);
  expect(clearStatistics(req).status).toBe(403);
  expect(db.getDb).not.toHaveBeenCalled();
});
it("clears only own HttpOnly statistics markers, never consent, voting or staff cookies", () => {
  const response = clearStatistics(request(`np_rd_${id}=1; np_consent=choice; np_poll_voter=vote; staff_session=secret; np_rd_invalid=1`));
  expect(response.status).toBe(204);
  expect(response.cookies.getAll()).toHaveLength(1);
  expect(response.cookies.get(`np_rd_${id}`)).toMatchObject({ value: "", maxAge: 0, path: "/", httpOnly: true, secure: true, sameSite: "lax" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(db.getDb).not.toHaveBeenCalled();
});
