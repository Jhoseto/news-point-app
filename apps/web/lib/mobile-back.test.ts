import { describe, expect, it, vi } from "vitest";
import { canNavigateMobileBack, markMobileHistoryRoot, runMobileBack, type MobileBackState } from "./mobile-back";

const page: MobileBackState = { livePointOpen: false, latestOpen: false, headerSheetOpen: false, historyLength: 3 };

function actions() {
  return { closeLivePoint: vi.fn(), closeLatest: vi.fn(), closeHeaderSheet: vi.fn(), back: vi.fn(), home: vi.fn() };
}

describe("mobile Back", () => {
  it("returns through browser history from a normal article without replacing the page", () => {
    const handlers = actions();
    runMobileBack(page, handlers);
    expect(handlers.back).toHaveBeenCalledOnce();
    expect(handlers.home).not.toHaveBeenCalled();
    expect(handlers.closeLivePoint).not.toHaveBeenCalled();
  });

  it("has a useful home fallback for a directly opened PWA article", () => {
    const handlers = actions();
    runMobileBack({ ...page, historyLength: 1 }, handlers);
    expect(handlers.home).toHaveBeenCalledOnce();
    expect(handlers.back).not.toHaveBeenCalled();
  });

  it("closes Latest without going back from the article underneath it", () => {
    const handlers = actions();
    runMobileBack({ ...page, latestOpen: true }, handlers);
    expect(handlers.closeLatest).toHaveBeenCalledOnce();
    expect(handlers.back).not.toHaveBeenCalled();
    expect(handlers.home).not.toHaveBeenCalled();
  });

  it("lets a header sheet remove its own synthetic history entry exactly once", () => {
    const handlers = actions();
    const pop = vi.fn();
    handlers.closeHeaderSheet.mockImplementation(pop);
    runMobileBack({ ...page, headerSheetOpen: true }, handlers);
    expect(pop).toHaveBeenCalledOnce();
    expect(handlers.back).not.toHaveBeenCalled();
    expect(handlers.home).not.toHaveBeenCalled();
  });

  it("leaves unsaved My News text under the provider's confirmation without a second navigation", () => {
    const handlers = actions();
    const confirmExit = vi.fn(() => false);
    handlers.closeLivePoint.mockImplementation(() => { confirmExit(); });
    runMobileBack({ ...page, livePointOpen: true }, handlers);
    expect(confirmExit).toHaveBeenCalledOnce();
    expect(handlers.back).not.toHaveBeenCalled();
    expect(handlers.home).not.toHaveBeenCalled();
    expect(handlers.closeLatest).not.toHaveBeenCalled();
    expect(handlers.closeHeaderSheet).not.toHaveBeenCalled();
  });

  it("dismisses a deep-linked LivePoint panel before applying the no-history home fallback", () => {
    const handlers = actions();
    runMobileBack({ ...page, livePointOpen: true, historyLength: 1 }, handlers);
    expect(handlers.closeLivePoint).toHaveBeenCalledOnce();
    expect(handlers.home).not.toHaveBeenCalled();
    expect(handlers.back).not.toHaveBeenCalled();
  });

  it("executes only one close during a transient handoff between mobile panels", () => {
    const handlers = actions();
    runMobileBack({ ...page, livePointOpen: true, latestOpen: true, headerSheetOpen: true }, handlers);
    expect(handlers.closeLivePoint).toHaveBeenCalledOnce();
    expect(Object.values(handlers).flatMap(handler => handler.mock.calls)).toHaveLength(1);
  });

  it("uses the home fallback when only forward entries remain after dismissing a phone panel", () => {
    const href = "https://newspoint.bg/article/";
    let state: unknown = { routerField: "preserved" };
    const history = {
      length: 1, get state() { return state; },
      replaceState: vi.fn((next: unknown, _unused: string) => { state = next; }),
    };
    markMobileHistoryRoot(history, href);
    const originalEntry = state;
    history.length = 2;
    state = { npSheet: "search" }; // The sheet pushed a second entry.
    state = originalEntry; // Back closed it; total history length is still two.
    const handlers = actions();
    runMobileBack({ ...page, historyLength: history.length,
      canGoBack: canNavigateMobileBack({ history, location: { href } }) }, handlers);
    expect(handlers.home).toHaveBeenCalledOnce();
    expect(handlers.back).not.toHaveBeenCalled();
    expect(state).toMatchObject({ routerField: "preserved" });
    expect(history.replaceState).toHaveBeenCalledWith(expect.any(Object), "");
  });

  it("does not mistake copied LivePoint state or a different page for the root entry", () => {
    let state: unknown = null;
    const history = { length: 1, get state() { return state; }, replaceState(next: unknown) { state = next; } };
    markMobileHistoryRoot(history, "https://newspoint.bg/article/");
    history.length = 2;
    expect(canNavigateMobileBack({ history, location: { href: "https://newspoint.bg/article/?livepoint=my-news" } })).toBe(true);
    expect(canNavigateMobileBack({ history, location: { href: "https://newspoint.bg/another-article/" } })).toBe(true);
    expect(canNavigateMobileBack({ history, location: { href: "https://newspoint.bg/article/" } })).toBe(false);
  });

  it("uses the Navigation API's actual position instead of the legacy total count", () => {
    const history = { length: 5, state: {} };
    expect(canNavigateMobileBack({ history, location: { href: "https://newspoint.bg/" }, navigation: { canGoBack: false } })).toBe(false);
    expect(canNavigateMobileBack({ history, location: { href: "https://newspoint.bg/" }, navigation: { canGoBack: true } })).toBe(true);
  });

  it("does not overwrite a prior history entry or unrelated primitive state", () => {
    const replaceState = vi.fn();
    markMobileHistoryRoot({ length: 3, state: {}, replaceState }, "https://newspoint.bg/article/");
    markMobileHistoryRoot({ length: 1, state: "unrelated", replaceState }, "https://newspoint.bg/article/");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("keeps ordinary back navigation usable if a restricted browser rejects the marker", () => {
    const history = { length: 1, state: null, replaceState() { throw new DOMException("Blocked", "SecurityError"); } };
    expect(() => markMobileHistoryRoot(history, "https://newspoint.bg/article/")).not.toThrow();
    expect(canNavigateMobileBack({ history, location: { href: "https://newspoint.bg/article/" } })).toBe(false);
    history.length = 2;
    expect(canNavigateMobileBack({ history, location: { href: "https://newspoint.bg/article/" } })).toBe(true);
  });
});
