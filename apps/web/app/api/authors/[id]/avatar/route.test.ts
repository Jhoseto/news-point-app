import { beforeEach, expect, it, vi } from "vitest";

const avatar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/author-avatar", () => ({ currentPublicAuthorAvatar: avatar }));
import { GET } from "./route";

beforeEach(() => avatar.mockReset());

it("serves the current avatar without permitting a cached copy", async () => {
  avatar.mockResolvedValue(new Response(new Uint8Array([1]), { headers: { "cache-control": "no-store", "content-type": "image/webp" } }));
  const response = await GET(new Request("https://newspoint.bg/api/authors/staff-1/avatar/"), { params: Promise.resolve({ id: "staff-1" }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(avatar).toHaveBeenCalledWith("staff-1");
});

it("does not expose missing or malformed author photos", async () => {
  avatar.mockResolvedValue(null);
  const missing = await GET(new Request("https://newspoint.bg/api/authors/staff-1/avatar/"), { params: Promise.resolve({ id: "staff-1" }) });
  expect(missing.status).toBe(404);
  expect(missing.headers.get("cache-control")).toBe("no-store");
  const invalid = await GET(new Request("https://newspoint.bg/api/authors/x/avatar/"), { params: Promise.resolve({ id: "x".repeat(201) }) });
  expect(invalid.status).toBe(404);
  expect(avatar).toHaveBeenCalledTimes(1);
});
