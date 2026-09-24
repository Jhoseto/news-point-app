// Studio is served under /admin (next.config basePath). Next adds the prefix to
// Link, router and redirect; raw URLs (img, a, fetch, history) need it here.
export const BASE_PATH = "/admin";

export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}
