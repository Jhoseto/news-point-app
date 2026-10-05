import { describe, expect, it } from "vitest";
import { isLatestRowVisible, measureLatestFlyout, type LatestRect } from "./latest-preview";

function rect(left: number, top: number, width: number, height: number): LatestRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

describe("latest news hover card", () => {
  it("sits inside the homepage middle column, against the panel", () => {
    const flyout = measureLatestFlyout({
      stage: rect(640, 120, 280, 480),
      panel: rect(936, 120, 304, 480),
      link: rect(950, 200, 260, 48),
      viewportHeight: 900,
    });
    expect(flyout).toMatchObject({
      cardLeft: 684,
      cardTop: 120,
      cardWidth: 240,
      cardHeight: 480,
      anchorY: 224,
      connectorWidth: 12,
      backdropLeft: 640,
      backdropWidth: 280,
      backdropHeight: 480,
    });
  });

  it("uses the same card cap on the tall rubric rail", () => {
    const flyout = measureLatestFlyout({
      stage: rect(80, 200, 900, 2400),
      panel: rect(1000, 160, 384, 800),
      link: rect(1020, 470, 320, 60),
      viewportHeight: 1000,
    });
    expect(flyout).toMatchObject({
      cardWidth: 300,
      cardHeight: 544,
      cardLeft: 688,
      cardTop: 228,
      backdropLeft: 80,
      backdropTop: 160,
      backdropWidth: 900,
      backdropHeight: 800,
    });
  });

  it("keeps the card inside the panel when the row is near the bottom", () => {
    const flyout = measureLatestFlyout({
      stage: rect(80, 200, 900, 2400),
      panel: rect(1000, 100, 384, 800),
      link: rect(1020, 850, 320, 60),
      viewportHeight: 1000,
    });
    expect(flyout?.cardTop).toBe(356);
    expect(flyout!.cardTop + flyout!.cardHeight).toBe(900);
  });

  it("does not open over a column that is too narrow", () => {
    expect(measureLatestFlyout({
      stage: rect(700, 120, 200, 480),
      panel: rect(920, 120, 304, 480),
      link: rect(930, 200, 260, 48),
      viewportHeight: 900,
    })).toBeNull();
  });

  it("treats a row as visible only while it intersects the list", () => {
    const scroller = rect(900, 180, 300, 400);
    expect(isLatestRowVisible(rect(910, 200, 260, 40), scroller)).toBe(true);
    expect(isLatestRowVisible(rect(910, 100, 260, 40), scroller)).toBe(false);
    expect(isLatestRowVisible(rect(910, 600, 260, 40), scroller)).toBe(false);
  });
});
