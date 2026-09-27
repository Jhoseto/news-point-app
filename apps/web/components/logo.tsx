"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { BrandLogoImg } from "./brand-logo-img";
import { useReducedMotion } from "./reader-preferences";

export function Logo({ className = "h-10", variant = "default" }: { className?: string; variant?: "default" | "header" }) {
  const isHeader = variant === "header";
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  function onLogoClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/") return;
    event.preventDefault();
    const smooth = !reduceMotion;
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "instant" });
  }

  return (
    <Link
      href="/"
      aria-label="NewsPoint.bg – начало"
      className={`inline-flex shrink-0 items-center ${isHeader ? "min-w-0 max-lg:flex-1 max-lg:justify-start" : ""}`}
      onClick={onLogoClick}
    >
      <BrandLogoImg
        fetchPriority="high"
        className={
          isHeader
            ? `np-header-logo np-brand-logo ${className}`
            : `${className} w-auto max-w-[min(100%,20rem)] object-contain object-left np-brand-logo`
        }
      />
    </Link>
  );
}
