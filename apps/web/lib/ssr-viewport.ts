import "server-only";
import { cookies, headers } from "next/headers";
import { VIEWPORT_COOKIE } from "./viewport-shell";

const DESKTOP_MIN_PX = 1024; // Tailwind `lg` / 64rem

/**
 * Which shell to SSR so the HTML is not both the mobile and desktop trees.
 * Prefers the browser's measured breakpoint, then Client Hints and UA.
 * Defaults to desktop for bots without hints.
 */
export async function ssrDesktopViewport(): Promise<boolean> {
  const h = await headers();
  // Safari and narrow desktop windows may have no width hint. The client
  // records its actual CSS breakpoint before refreshing the exclusive shell.
  // This also honours readers whose default rem size differs from 16px.
  const viewport = (await cookies()).get(VIEWPORT_COOKIE)?.value;
  if (viewport === "mobile" || viewport === "desktop") return viewport === "desktop";
  const widthRaw = h.get("sec-ch-viewport-width") ?? h.get("viewport-width");
  const width = widthRaw ? Number(widthRaw) : NaN;
  if (Number.isFinite(width) && width > 0) return width >= DESKTOP_MIN_PX;
  const chMobile = h.get("sec-ch-ua-mobile");
  if (chMobile === "?1") return false;
  if (chMobile === "?0") return true;

  const ua = h.get("user-agent") ?? "";
  if (/Android|iPhone|iPod|Mobile/i.test(ua) && !/iPad|Tablet/i.test(ua)) return false;
  return true;
}
