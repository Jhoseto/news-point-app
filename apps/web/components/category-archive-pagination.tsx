"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, type ComponentProps, type MouseEvent } from "react";

const SCROLL_FLAG = "np-rubric-cards-scroll";

export function isRubricFirstPageUrl(pathname: string, rubricPath: string): boolean {
  if (rubricPath === "/") return pathname === "/";
  const normalized = rubricPath.endsWith("/") ? rubricPath : `${rubricPath}/`;
  return pathname === normalized || pathname === normalized.slice(0, -1);
}

export function scrollToRubricTop() {
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function handleRubricMenuClick(
  event: MouseEvent<HTMLAnchorElement>,
  rubricPath: string,
  pathname: string,
) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || rubricPath === "/") return;
  if (isRubricFirstPageUrl(pathname, rubricPath)) {
    event.preventDefault();
    scrollToRubricTop();
    return;
  }
  markRubricArchiveScroll(rubricPath);
}

export function markRubricArchiveScroll(path: string) {
  try {
    sessionStorage.setItem(SCROLL_FLAG, path);
  } catch {
    /* private mode */
  }
}

export function rubricCardsScrollAnchorProps() {
  return { id: "np-rubric-cards", className: "scroll-mt-[var(--np-header-h)]" } as const;
}

export function CategoryArchiveScrollOnNavigate() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    try {
      const target = sessionStorage.getItem(SCROLL_FLAG);
      if (!target) return;
      sessionStorage.removeItem(SCROLL_FLAG);
      if (!isRubricFirstPageUrl(pathname, target)) return;
    } catch { return; }
    scrollToRubricTop();
    const frame = requestAnimationFrame(scrollToRubricTop);
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}

type ArchivePageLinkProps = ComponentProps<typeof Link>;

export function CategoryArchivePageLink({ onClick, ...props }: ArchivePageLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
          markRubricArchiveScroll(event.currentTarget.pathname);
        }
      }}
    />
  );
}
