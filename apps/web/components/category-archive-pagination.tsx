"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ComponentProps } from "react";
import { useReducedMotion } from "./reader-preferences";

const SCROLL_FLAG = "np-rubric-cards-scroll";

export function markRubricArchiveScroll() {
  try {
    sessionStorage.setItem(SCROLL_FLAG, "1");
  } catch {
    /* private mode */
  }
}

export function rubricCardsScrollAnchorProps() {
  return { id: "np-rubric-cards", className: "scroll-mt-[var(--np-header-h)]" } as const;
}

export function CategoryArchiveScrollOnNavigate() {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(SCROLL_FLAG) === "1";
      if (flagged) sessionStorage.removeItem(SCROLL_FLAG);
    } catch {
      flagged = false;
    }
    if (!flagged) return;
    const behavior = reducedMotion ? ("instant" as const) : ("smooth" as const);
    const run = () => {
      const target = document.getElementById("np-rubric-cards");
      if (target) target.scrollIntoView({ behavior, block: "start" });
      else window.scrollTo({ top: 0, behavior });
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [pathname, reducedMotion]);

  return null;
}

type ArchivePageLinkProps = ComponentProps<typeof Link>;

export function CategoryArchivePageLink({ onClick, ...props }: ArchivePageLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        markRubricArchiveScroll();
        onClick?.(event);
      }}
    />
  );
}
