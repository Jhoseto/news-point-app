export const MOBILE_RUBRIC_NAVIGATE = "np:mobile-rubric-navigate";
export const MOBILE_RUBRIC_STATUS = "np:mobile-rubric-status";
export type MobileRubric = { name: string; path: string };
/** Browser paths percent-encode Cyrillic; keep encoded separators reserved. */
export function mobileRoutePath(path: string): string { try { return decodeURI(path); } catch { return path; } }

/** Menu paths only. Never turn an arbitrary URL into a public-feed request. */
export function canonicalRubricPath(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\%\s]/.test(path) || path.includes("..")) return null;
  if (path === "/") return path;
  const value = path.replace(/\/$/, "");
  return /^\/[\p{L}\p{N}_-]+$/u.test(value) ? `${value}/` : null;
}
export function mobileRubrics(menu: readonly MobileRubric[]): MobileRubric[] {
  const seen = new Set(["/"]);
  return [{ name: "За теб", path: "/" }, ...menu.flatMap(item => {
    const path = canonicalRubricPath(item.path);
    if (!path || seen.has(path)) return [];
    seen.add(path); return [{ name: item.name, path }];
  })];
}
export function rubricRoute(path: string, items: readonly MobileRubric[]) {
  path = mobileRoutePath(path);
  const canonical = canonicalRubricPath(path);
  const index = items.findIndex(item => item.path === canonical);
  if (index >= 0) return { index, swipe: true };
  const archive = path.match(/^(\/[^/]+\/)archive\/[^/]+\/?$/);
  const archiveIndex = archive ? items.findIndex(item => item.path === archive[1]) : -1;
  return { index: archiveIndex, swipe: false };
}
export function rubricNeighbour(items: readonly MobileRubric[], index: number, direction: -1 | 1) {
  return index < 0 ? undefined : items[index + direction];
}
export function publicVersion(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}
export function rubricMenuVersion(items: readonly MobileRubric[]) { return publicVersion(JSON.stringify(items.map(item => [item.name, item.path]))); }
export type PagerPhase = "idle" | "tracking" | "dragging" | "settling" | "navigating";
export type PagerOperation = { token: number; phase: PagerPhase; target: string | null; committed: boolean; motionDone: boolean; routeReady: boolean };
export type PagerEvent = { type: "track"; token: number } | { type: "drag"; token: number; target: string | null }
  | { type: "commit"; token: number; target: string } | { type: "motion" | "ready" | "reset"; token: number };
export const idlePager: PagerOperation = { token: 0, phase: "idle", target: null, committed: false, motionDone: false, routeReady: false };
/** Both completion gates belong to the same operation; stale callbacks cannot finish its successor. */
export function pagerTransition(state: PagerOperation, event: PagerEvent): PagerOperation {
  if (event.type === "track") return state.phase === "idle" && event.token > state.token ? { ...idlePager, token: event.token, phase: "tracking" } : state;
  if (event.token !== state.token) return state;
  if (event.type === "reset") return { ...idlePager, token: state.token };
  if (event.type === "drag") return !state.committed && (state.phase === "tracking" || state.phase === "dragging") ? { ...state, phase: "dragging", target: event.target } : state;
  if (event.type === "commit") return !state.committed && (state.phase === "tracking" || state.phase === "dragging") ? { ...state, phase: "settling", target: event.target, committed: true } : state;
  if (!state.committed) return state;
  const next = { ...state, motionDone: state.motionDone || event.type === "motion", routeReady: state.routeReady || event.type === "ready" };
  return { ...next, phase: next.motionDone && next.routeReady ? "idle" : next.motionDone ? "navigating" : "settling" };
}
export function swipeIntent(dx: number, dy: number, elapsed: number): "wait" | "cancel" | "drag" {
  if (elapsed >= 350) return "cancel";
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return "wait";
  return Math.abs(dx) >= Math.abs(dy) * 1.5 ? "drag" : "cancel";
}
export function commitSwipe(dx: number, width: number, velocity: number): boolean {
  return Math.abs(dx) >= Math.min(width * .25, 100) || (Math.abs(dx) >= 40 && Math.abs(velocity) >= .5 && Math.sign(velocity) === Math.sign(dx));
}
