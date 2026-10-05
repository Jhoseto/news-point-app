import { describe, expect, it } from "vitest";
import { canonicalRubricPath, mobileRubrics, rubricRoute, rubricNeighbour, rubricMenuVersion, swipeIntent, commitSwipe, idlePager, pagerTransition } from "./mobile-rubric-nav";
const items = mobileRubrics([{ name: "Пловдив", path: "/plovdiv" }, { name: "България", path: "/balgariya/" }]);
describe("mobile rubric navigation", () => {
  it("uses the ordered menu, canonicalizes and deduplicates without accepting external/nested paths", () => {
    expect(mobileRubrics([...items, { name: "duplicate", path: "/plovdiv/" }, { name: "foreign", path: "//evil.test/" }])).toEqual(items);
    for (const path of ["https://evil.test/", "/plovdiv/?draft=1", "/preview/1/", "/../", "/%2F", "/plovdiv/#x", "/plovdiv\\"]) expect(canonicalRubricPath(path)).toBeNull();
    expect(canonicalRubricPath("/пловдив")).toBe("/пловдив/");
  });
  it("makes first pages swipeable and archives tab-active only", () => {
    expect(rubricRoute("/", items)).toEqual({ index: 0, swipe: true });
    expect(rubricRoute("/plovdiv/archive/eyJ2IjoxfQ/", items)).toEqual({ index: 1, swipe: false });
    expect(rubricRoute("/plovdiv-article/", items)).toEqual({ index: -1, swipe: false });
    expect(rubricRoute("/plovdiv/not-archive/", items)).toEqual({ index: -1, swipe: false });
    expect(rubricNeighbour(items, 0, -1)).toBeUndefined(); expect(rubricNeighbour(items, 2, 1)).toBeUndefined();
    expect(rubricRoute("/%D0%BD%D0%BE%D0%B2%D0%B8%D0%BD%D0%B8/", [{ name: "Новини", path: "/новини/" }])).toEqual({ index: 0, swipe: true });
    expect(rubricRoute("/plovdiv%2Farticle/", items).index).toBe(-1);
  });
  it("versions menu meaning independently of object insertion order", () => {
    expect(rubricMenuVersion(items)).toBe(rubricMenuVersion(items.map(({ name, path }) => ({ path, name }))));
    expect(rubricMenuVersion(items)).not.toBe(rubricMenuVersion([...items].reverse()));
  });
  it("locks horizontal intent only after distance and rejects vertical, ambiguous and held gestures", () => {
    expect(swipeIntent(11, 0, 20)).toBe("wait"); expect(swipeIntent(12, 8, 20)).toBe("drag");
    expect(swipeIntent(12, 9, 20)).toBe("cancel"); expect(swipeIntent(1, 15, 20)).toBe("cancel");
    expect(swipeIntent(40, 0, 350)).toBe("cancel");
  });
  it("commits only release distance or recent matching flick velocity", () => {
    expect(commitSwipe(97.5, 390, 0)).toBe(true); expect(commitSwipe(90, 390, .1)).toBe(false);
    expect(commitSwipe(-40, 390, -.5)).toBe(true); expect(commitSwipe(-39, 390, -2)).toBe(false);
    expect(commitSwipe(-60, 390, .9)).toBe(false); expect(commitSwipe(100, 768, 0)).toBe(true);
  });
  it("waits for both mounted route and motion, regardless of completion order", () => {
    const tracked = pagerTransition(idlePager, { type: "track", token: 1 });
    const committed = pagerTransition(tracked, { type: "commit", token: 1, target: "/plovdiv/" });
    for (const first of ["ready", "motion"] as const) {
      const waiting = pagerTransition(committed, { type: first, token: 1 }); expect(waiting.phase).not.toBe("idle");
      expect(pagerTransition(waiting, { type: first === "ready" ? "motion" : "ready", token: 1 }).phase).toBe("idle");
    }
    expect(pagerTransition(committed, { type: "ready", token: 0 })).toBe(committed);
    expect(pagerTransition(committed, { type: "reset", token: 1 }).committed).toBe(false);
  });
  it("ignores duplicate commits and illegal or stale operation starts", () => {
    expect(pagerTransition(idlePager, { type: "ready", token: 0 })).toBe(idlePager);
    const tracking = pagerTransition(idlePager, { type: "track", token: 5 });
    const committed = pagerTransition(tracking, { type: "commit", token: 5, target: "/plovdiv/" });
    expect(pagerTransition(committed, { type: "commit", token: 5, target: "/balgariya/" })).toBe(committed);
    expect(pagerTransition(committed, { type: "track", token: 6 })).toBe(committed);
    const reset = pagerTransition(committed, { type: "reset", token: 5 });
    expect(pagerTransition(reset, { type: "track", token: 4 })).toBe(reset);
  });
});
