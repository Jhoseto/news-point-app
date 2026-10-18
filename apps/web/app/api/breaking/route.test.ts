import { beforeEach, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("@newspoint/db", () => ({ getDb: () => ({}), readPublicBreaking: read }));
import { GET } from "./route";
beforeEach(() => { read.mockReset(); });
it("returns the current public message without HTTP caching", async () => {
  const bulletin = { version: 4, text: "Explicit QA fixture", path: null };
  read.mockResolvedValue(bulletin);
  const response = await GET();
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ bulletin });
});
it("distinguishes a hidden message from an unavailable database", async () => {
  read.mockResolvedValue(null); expect(await (await GET()).json()).toEqual({ bulletin: null });
  read.mockRejectedValue(new Error("database unavailable"));
  const response = await GET(); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
});
