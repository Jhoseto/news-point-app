import { expect, it } from "vitest";
import { MobileFeedPositions } from "./mobile-rubric-scroll";
it("retains bounded exact URL positions even when session storage is blocked", () => {
  const positions = new MobileFeedPositions({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } });
  positions.save("/plovdiv/?q=1#news", { y: 400, anchor: "article", offset: -15, at: Date.now() });
  expect(positions.get("/plovdiv/")).toBeUndefined(); expect(positions.get("/plovdiv/?q=1#news")?.y).toBe(400);
  for (let i = 0; i < 33; i++) positions.save(`/route-${i}/`, { y: i, at: Date.now() });
  expect(positions.get("/plovdiv/?q=1#news")).toBeUndefined();
});
it("rejects corrupt, unsafe or expired session position values", () => {
  const input = [["/ok/", { y: 10, at: Date.now(), anchor: "x", offset: 1 }], ["/old/", { y: 1, at: 0 }], ["/bad/", { y: -1, at: Date.now() }], ["https://other/", { y: 1, at: Date.now() }]];
  const positions = new MobileFeedPositions({ getItem: () => JSON.stringify(input), setItem: () => {} });
  expect(positions.get("/ok/")?.anchor).toBe("x"); expect(positions.get("/old/")).toBeUndefined(); expect(positions.get("/bad/")).toBeUndefined();
});
