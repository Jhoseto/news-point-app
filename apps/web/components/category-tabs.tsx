"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type CategoryTab = {
  name: string;
  path: string;
};

/**
 * Horizontal row of category tabs that lives right below the leading composition.
 * First scroll reaches "За теб" (the home default). The next tab peeks from the
 * right edge so the user knows the row scrolls. Swipe switching is added in a
 * later step; for the prototype tapping a tab navigates.
 */
export function CategoryTabs({ items }: { items: CategoryTab[] }) {
  const current = usePathname() ?? "/";
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: true });

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => {
      const max = element.scrollWidth - element.clientWidth;
      setEdges({ left: element.scrollLeft > 4, right: max - element.scrollLeft > 4 });
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  return (
    <nav
      aria-label="Рубрики"
      data-more-left={edges.left || undefined}
      data-more-right={edges.right || undefined}
      className="np-cat-tabs -mx-4 px-4 lg:mx-0 lg:px-0"
    >
      <div
        ref={scroller}
        className="np-cat-tabs-scroll flex items-center gap-1.5 overflow-x-auto"
      >
        {items.map((item) => {
          const isHome = item.path === "/";
          const active = isHome ? current === "/" : current.startsWith(item.path);
          return (
            <CategoryTabLink key={item.path} item={item} active={active} />
          );
        })}
      </div>
    </nav>
  );
}

function CategoryTabLink({ item, active }: { item: CategoryTab; active: boolean }) {
  return (
    <Link
      href={item.path}
      aria-current={active ? "page" : undefined}
      className={`np-cat-tab inline-flex shrink-0 items-center justify-center rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap ${
        active
          ? "bg-accent text-on-accent"
          : "bg-surface-2 text-body hover:bg-line"
      }`}
    >
      {item.name}
    </Link>
  );
}