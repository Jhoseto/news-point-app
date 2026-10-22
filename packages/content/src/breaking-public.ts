export interface PublicBreaking { version: number; text: string; path: string | null; }
export const BREAKING_CHANGED = "np:breaking-changed";
export const BREAKING_SYNC = "np:breaking-sync";

export function breakingVisibleAt(pathname: string, categoryPaths: readonly string[]): boolean {
  if (pathname === "/") return true;
  const path = pathname.replace(/\/+$/, "");
  return categoryPaths.some(category => {
    const base = category.replace(/\/+$/, "");
    return path === base || path.startsWith(`${base}/archive/`) && !path.slice(base.length + 9).includes("/");
  });
}
