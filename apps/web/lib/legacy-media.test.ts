import { beforeEach, describe, expect, it, vi } from "vitest";
const qa = vi.hoisted(() => ({ query: vi.fn(), stat: vi.fn(), file: vi.fn(), filter: vi.fn() }));
vi.mock("@newspoint/db", () => ({ mediaAssets: { storageKey: "key", sourceUrl: "source" }, getDb: () => ({ select: () => ({ from: () => ({ where: qa.query }) }) }) }));
vi.mock("drizzle-orm", () => ({ inArray: qa.filter }));
vi.mock("./media-disk", () => ({ mediaFile: qa.file }));
vi.mock("node:fs/promises", () => ({ stat: qa.stat }));
import { legacyMediaDestination } from "./legacy-media";
beforeEach(() => { vi.resetAllMocks(); qa.query.mockResolvedValue([]); qa.file.mockReturnValue("/fixture/photo.webp"); qa.stat.mockResolvedValue({ isFile: () => true, size: 12 }); });
describe("WordPress upload compatibility", () => {
  it("preserves exact converted mappings before considering a sized original", async () => {
    qa.query.mockResolvedValue([{ storageKey: "news/2026/06/photo-small.webp" }]);
    expect(await legacyMediaDestination(["2026", "06", "photo-585x318.jpg"])).toBe("/media/news/2026/06/photo-small.webp");
    expect(qa.query).toHaveBeenCalledTimes(1); expect(qa.stat).not.toHaveBeenCalled();
  });
  it("resolves an old generated thumbnail only to a known, present migrated original", async () => {
    qa.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ storageKey: "news/2026/06/photo.webp" }]);
    expect(await legacyMediaDestination(["2026", "06", "photo-585x318.jpg"])).toBe("/media/news/2026/06/photo.webp");
    expect(qa.filter.mock.calls[1]![1]).toContain("https://newspoint.bg/wp-content/uploads/2026/06/photo.jpg");
    expect(qa.stat).toHaveBeenCalledWith("/fixture/photo.webp");
  });
  it.each(["missing", "empty", "directory"])("does not redirect to a %s fallback copy", async kind => {
    qa.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ storageKey: "news/2026/06/photo.webp" }]);
    if (kind === "missing") qa.stat.mockRejectedValue(new Error("missing"));
    else qa.stat.mockResolvedValue({ isFile: () => kind !== "directory", size: kind === "empty" ? 0 : 12 });
    expect(await legacyMediaDestination(["2026", "06", "photo-585x318.jpg"])).toBeNull();
  });
  it("rejects ambiguous originals and exact mappings without guessing", async () => {
    const conflict = [{ storageKey: "news/a.webp" }, { storageKey: "news/b.webp" }];
    qa.query.mockResolvedValue(conflict);
    expect(await legacyMediaDestination(["2026", "06", "photo-585x318.jpg"])).toBeNull();
    expect(qa.query).toHaveBeenCalledTimes(1);
  });
  it.each([[], ["..", "secret"], ["2026", "06", "x/y.jpg"], ["2026", "06", "x\\y.jpg"], ["2026", "06", "x\u0000.jpg"]])("rejects traversal and invalid components %j", async (...args) => {
    expect(await legacyMediaDestination(args as string[])).toBeNull(); expect(qa.query).not.toHaveBeenCalled();
  });
  it.each(["audio-585x318.mp3", "photo-0x318.jpg", "photo.jpg"])("does not invent a fallback for %s", async name => {
    expect(await legacyMediaDestination(["2026", "06", name])).toBeNull(); expect(qa.query).toHaveBeenCalledTimes(1);
  });
  it("includes encoded and Unicode exact source URLs", async () => {
    await legacyMediaDestination(["2024", "08", "к2.jpg"]);
    expect(qa.filter.mock.calls[0]![1]).toContain("https://newspoint.bg/wp-content/uploads/2024/08/%D0%BA2.jpg");
    expect(qa.filter.mock.calls[0]![1]).toContain("https://newspoint.bg/wp-content/uploads/2024/08/к2.jpg");
  });
});
