import "server-only";
import { headers } from "next/headers";

const DESKTOP_MIN_PX = 1024; // Tailwind `lg` / 64rem

/**
 * Which shell to SSR so the HTML is not both the mobile and desktop trees.
 * Prefers Client Hints, then UA; defaults to desktop for bots without hints.
 */
export async function ssrDesktopViewport(): Promise<boolean> {
  const h = await headers();
  const chMobile = h.get("sec-ch-ua-mobile");
  if (chMobile === "?1") return false;
  if (chMobile === "?0") return true;

  const widthRaw = h.get("sec-ch-viewport-width") ?? h.get("viewport-width");
  const width = widthRaw ? Number(widthRaw) : NaN;
  if (Number.isFinite(width) && width > 0) return width >= DESKTOP_MIN_PX;

  const ua = h.get("user-agent") ?? "";
  if (/Android|iPhone|iPod|Mobile/i.test(ua) && !/iPad|Tablet/i.test(ua)) return false;
  return true;
}
