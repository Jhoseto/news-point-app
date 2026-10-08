import { expect, it } from "vitest";
import { bodyImageIds } from "./editor/body";

it("collects unique image ids from editor body text", () => {
  const a = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const b = "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee";
  expect(bodyImageIds(`текст\n\n[[image:${a}|size=large]]\n\nоще\n\n[[image:${b}]]\n\n[[image:${a}|size=small]]`)).toEqual([a, b]);
  expect(bodyImageIds("без снимки")).toEqual([]);
});
