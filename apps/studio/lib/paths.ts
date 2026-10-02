// Studio lives at /admin (next.config basePath). Next.js prepends it for Link,
// router and redirect — use paths like "/login/" there, not withBase().
// Raw URLs (img src, fetch, history, email links) use withBase() or absoluteStudioUrl().

export const BASE_PATH = "/admin";

const DEFAULT_PUBLIC_BASE = "http://localhost:3000/admin";

function readPublicBaseRaw(): string {
  return (process.env.STUDIO_PUBLIC_URL ?? process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL ?? DEFAULT_PUBLIC_BASE).trim();
}

/** Public Studio base without trailing slash, e.g. https://newspoint.bg/admin */
export function readStudioPublicBaseUrl(): string {
  const raw = readPublicBaseRaw();
  const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  let path = url.pathname.replace(/\/+$/, "") || "";
  if (path === "" || path === "/") path = BASE_PATH;
  else if (path !== BASE_PATH && !path.startsWith(`${BASE_PATH}/`)) path = BASE_PATH;
  return `${url.origin}${path}`;
}

/** Full public URL for a Studio page (emails, Better Auth redirectTo). */
export function absoluteStudioUrl(path: string): string {
  const base = readStudioPublicBaseUrl();
  let route = path.startsWith("/") ? path : `/${path}`;
  if (!route.endsWith("/")) route += "/";
  return `${base}${route}`;
}

/** Rewrite Better Auth reset links to the public Studio host/path. */
export function normalizePasswordResetUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token");
    const error = parsed.searchParams.get("error");
    const target = new URL(absoluteStudioUrl("/login/reset"));
    if (token) target.searchParams.set("token", token);
    if (error) target.searchParams.set("error", error);
    return target.toString();
  } catch {
    return url;
  }
}

/** Browser path under /admin (fetch, img, history.replaceState). */
export function withBase(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}

function addOrigin(trusted: Set<string>, raw: string | undefined) {
  const value = raw?.trim();
  if (!value) return;
  try {
    trusted.add(new URL(value.includes("://") ? value : `https://${value}`).origin);
  } catch {
    /* ignore invalid URL */
  }
}

/** Origins allowed for Better Auth (public site, direct Studio, www/non-www). */
export function studioTrustedOrigins(): string[] {
  const publicBase = readStudioPublicBaseUrl();
  const publicOrigin = new URL(publicBase).origin;
  const directOrigin = new URL(process.env.STUDIO_URL ?? "http://localhost:3001").origin;
  const trusted = new Set([publicOrigin, directOrigin]);
  addOrigin(trusted, process.env.WEB_URL);
  for (const part of process.env.STUDIO_EXTRA_TRUSTED_ORIGINS?.split(",") ?? []) {
    addOrigin(trusted, part);
  }
  const { hostname, protocol } = new URL(publicBase);
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    if (hostname.startsWith("www.")) trusted.add(`${protocol}//${hostname.slice(4)}`);
    else trusted.add(`${protocol}//www.${hostname}`);
  }
  // Local investor demo via Cloudflare quick tunnel (Better Auth wildcard docs).
  // Off by default; opt in with NP_ALLOW_CF_TUNNEL=1 (set by scripts/start-public-demo.ps1).
  // When on, the public + WEB_URL origins above are still the recommended path — this
  // wildcard is only here for the *single* demo flow that uses a quick-tunnel host.
  if (process.env.NP_ALLOW_CF_TUNNEL === "1") trusted.add("https://*.trycloudflare.com");
  return [...trusted];
}
