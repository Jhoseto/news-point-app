import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ staff: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/session", () => ({ staffFromRequest: mocks.staff }));
vi.mock("@/lib/story-themes", () => ({ searchPublicArticlesForTheme: mocks.search }));
import { GET } from "./route";

beforeEach(() => vi.resetAllMocks());
it("returns private 401 JSON for expired sessions without calling search or redirecting", async () => {
  mocks.staff.mockResolvedValue(null);
  const result = await GET(new Request("http://studio.test/admin/api/stories/search-articles/?q=fixture"));
  expect(result.status).toBe(401);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(result.headers.has("location")).toBe(false);
  expect(await result.json()).toMatchObject({ error: { code: "session_expired" } });
  expect(mocks.search).not.toHaveBeenCalled();
});
it("continues searching for authenticated editorial staff with no-store", async () => {
  const staff = { id: "fixture-editor", role: "editor" };
  mocks.staff.mockResolvedValue(staff); mocks.search.mockResolvedValue({ articles: [], hasMore: false });
  const result = await GET(new Request("http://studio.test/admin/api/stories/search-articles/?q=fixture&limit=500&offset=2"));
  expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toContain("no-store");
  expect(mocks.search).toHaveBeenCalledWith(staff, "fixture", 100, 2);
});
