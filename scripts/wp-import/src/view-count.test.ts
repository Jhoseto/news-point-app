import { expect, it } from "vitest";
import { parseViewCount } from "./view-count";

it("accepts an exact non-negative view total", () => {
  expect(parseViewCount("865")).toBe(865);
  expect(parseViewCount(" 0\n")).toBe(0);
  expect(parseViewCount("nope")).toBeNull();
  expect(parseViewCount("-1")).toBeNull();
  expect(parseViewCount("1.5")).toBeNull();
});
