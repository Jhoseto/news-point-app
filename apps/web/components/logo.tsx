"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

const LOGO_WIDTH = 1261;
const LOGO_HEIGHT = 343;

export function Logo({ className = "h-10" }: { className?: string }) {
  const pathname = usePathname();

  function onLogoClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/") return;
    event.preventDefault();
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "instant" });
  }

  return (
    <Link href="/" aria-label="NewsPoint.bg – начало" className="inline-flex shrink-0 items-center" onClick={onLogoClick}>
      <img
        src="/brand/newspoint-logo.webp"
        alt="NewsPoint.bg"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className={`${className} w-auto dark:hidden`}
      />
      <img
        src="/brand/newspoint-logo-dark.webp"
        alt="NewsPoint.bg"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className={`${className} hidden w-auto dark:block`}
      />
    </Link>
  );
}
