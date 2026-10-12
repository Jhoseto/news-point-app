import { expect, it } from "vitest";
import { INSTALL_DISMISS_MS, installDismissed, installInterest } from "./pwa-install-policy";

it("requires visible reading time and scrolling before offering installation", () => {
  expect(installInterest(29_999, 500, 844)).toBe(false);
  expect(installInterest(60_000, 0, 844)).toBe(false);
  expect(installInterest(30_000, 422, 844)).toBe(true);
});
it("honours a dismissal across sessions until its expiry, ignoring corrupt values", () => {
  const now = 1_800_000_000_000;
  const until = String(now + INSTALL_DISMISS_MS);
  expect(installDismissed(until, now)).toBe(true);
  expect(installDismissed(until, now - 60_000)).toBe(true);
  expect(installDismissed(until, now + INSTALL_DISMISS_MS)).toBe(false);
  for (const value of [null, "1", "NaN", "Infinity", "9007199254740992"]) expect(installDismissed(value, now)).toBe(false);
});
