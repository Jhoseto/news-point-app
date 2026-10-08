import { describe, expect, it } from "vitest";
import { imageFilesFromDataTransfer } from "./media-picker-paste";

function transferWith(files: File[]): DataTransfer {
  const items = files.map((file) => ({
    kind: "file" as const,
    type: file.type,
    getAsFile: () => file,
  }));
  return {
    items: {
      length: items.length,
      [Symbol.iterator]: () => items[Symbol.iterator](),
    },
    files: {
      length: files.length,
      [Symbol.iterator]: () => files[Symbol.iterator](),
    },
  } as unknown as DataTransfer;
}

describe("imageFilesFromDataTransfer", () => {
  it("collects accepted image files from clipboard-like transfer", () => {
    const png = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    const txt = new File([new Uint8Array([4])], "note.txt", { type: "text/plain" });
    const files = imageFilesFromDataTransfer(transferWith([png, txt]));
    expect(files).toHaveLength(1);
    expect(files[0]?.type).toBe("image/png");
    expect(files[0]?.name).toBe("shot.png");
  });

  it("names anonymous clipboard blobs", () => {
    const blob = new File([new Uint8Array([9])], "image.png", { type: "image/png" });
    const files = imageFilesFromDataTransfer(transferWith([blob]));
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toMatch(/^paste-\d+-[a-z0-9]+\.png$/);
  });

  it("returns empty for null or text-only transfers", () => {
    expect(imageFilesFromDataTransfer(null)).toEqual([]);
    expect(imageFilesFromDataTransfer(transferWith([new File(["x"], "a.txt", { type: "text/plain" })]))).toEqual([]);
  });
});
