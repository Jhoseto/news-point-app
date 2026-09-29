import { describe, expect, it } from "vitest";
import { artificialForSeed, boostSteps, intervalToSeconds, splitInterval } from "./view-boost";

describe("view boost", () => {
  it("shows the publish number by adding only what real views do not already cover", () => {
    expect(artificialForSeed(300, 0)).toBe(300);
    expect(artificialForSeed(300, 40)).toBe(260);
    expect(artificialForSeed(300, 300)).toBe(0);
    expect(artificialForSeed(300, 890)).toBe(0);
  });

  it("does not schedule an automatic increase without an interval", () => {
    expect(intervalToSeconds(null, "minutes")).toBeNull();
    expect(intervalToSeconds(0, "seconds")).toBeNull();
    expect(intervalToSeconds(5, "minutes")).toBe(300);
    expect(intervalToSeconds(2, "hours")).toBe(7200);
  });

  it("catches up missed steps without passing the remaining room", () => {
    expect(boostSteps(0, 10, 100)).toBe(1);
    expect(boostSteps(45, 10, 100)).toBe(5);
    expect(boostSteps(45, 10, 2)).toBe(2);
    expect(boostSteps(45, 10, 0)).toBe(0);
  });

  it("restores minutes and hours from stored seconds", () => {
    expect(splitInterval(300)).toEqual({ amount: 5, unit: "minutes" });
    expect(splitInterval(7200)).toEqual({ amount: 2, unit: "hours" });
    expect(splitInterval(15)).toEqual({ amount: 15, unit: "seconds" });
    expect(splitInterval(null)).toEqual({ amount: null, unit: "minutes" });
  });
});
