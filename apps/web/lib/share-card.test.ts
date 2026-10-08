import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@newspoint/db", () => ({ loadRootEnv: () => undefined }));

import { podcastShareCard, shareCardLines } from "./share-card";

describe("shareCardLines", () => {
  it("wraps long titles without inventing text", () => {
    expect(shareCardLines("Една две три четири пет шест седем", 10, 3)).toEqual([
      "Една две",
      "три четири",
      "пет шест",
    ]);
  });

  it("falls back to the brand when empty", () => {
    expect(shareCardLines("   ")).toEqual(["NewsPoint.bg"]);
  });
});

describe("podcastShareCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a 1200×630 PNG with or without cover art", async () => {
    const cover = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "#3355aa" },
    }).png().toBuffer();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(cover, { status: 200, headers: { "content-type": "image/png" } })),
    );
    const withCover = await podcastShareCard({
      title: "Илюзията за контрол над изкуствения интелект",
      durationSec: 1525,
      categoryName: "Технологии",
      imageUrl: "https://example.test/cover.png",
    });
    const meta = await sharp(withCover).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
    expect(meta.format).toBe("png");

    const branded = await podcastShareCard({
      title: "Епизод без обложка",
      durationSec: 61,
      categoryName: null,
      imageUrl: null,
    });
    const brandedMeta = await sharp(branded).metadata();
    expect(brandedMeta.width).toBe(1200);
    expect(brandedMeta.height).toBe(630);
  });
});
