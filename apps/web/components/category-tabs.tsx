"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type CategoryTab = {
  name: string;
  path: string;
};

/**
 * Horizontal row of category tabs that lives right below the leading composition.
 *
 *   - Tap a chip to navigate.
 *   - Swipe horizontally across the row (with horizontal dominance over
 *     vertical motion, and within ~500 ms) to jump to the next/prev
 *     rubric. Vertical / diagonal motion is left to the page scroll and
 *     to the scrollable strip itself.
 *   - Only one finger is tracked at a time; a second touch is ignored so a
 *     multi-finger gesture never produces a double swipe.
 *   - All pointer listeners are removed on component unmount, even if the
 *     user is mid-swipe, so we never leak them.
 */
export function CategoryTabs({ items }: { items: CategoryTab[] }) {
  const current = usePathname() ?? "/";
  const router = useRouter();
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

  const activeIndex = items.findIndex((item) => {
    const isHome = item.path === "/";
    return isHome ? current === "/" : current.startsWith(item.path);
  });

  const onSwipe = useCallback(
    (direction: -1 | 1) => {
      if (activeIndex < 0) return;
      const nextIndex = activeIndex + direction;
      if (nextIndex < 0 || nextIndex >= items.length) return;
      const next = items[nextIndex]!;
      // Make the next tab visible after navigation: scroll it into view.
      requestAnimationFrame(() => {
        const element = scroller.current?.querySelector<HTMLAnchorElement>(`a[href="${next.path}"]`);
        element?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      });
      router.push(next.path);
    },
    [activeIndex, items, router],
  );

  // Single-touch tracking lives in a ref so the cleanup function can detach
  // every listener even when the swipe is still in flight at unmount time.
  const swipeState = useRef<{
    target: HTMLElement;
    onMove: (event: PointerEvent) => void;
    onUp: (event: PointerEvent) => void;
  } | null>(null);

  const stopSwipe = useCallback(() => {
    const state = swipeState.current;
    if (!state) return;
    state.target.removeEventListener("pointermove", state.onMove);
    state.target.removeEventListener("pointerup", state.onUp);
    state.target.removeEventListener("pointercancel", state.onUp);
    swipeState.current = null;
  }, []);

  // Detach listeners on unmount even if a swipe is mid-flight.
  useEffect(() => stopSwipe, [stopSwipe]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Ignore a second finger: only the first one drives a swipe.
    if (swipeState.current) return;
    const target = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const startTime = event.timeStamp;
    let tracking = true;
    let dominant: "h" | "v" = "h";
    let lastX = startX;
    let lastY = startY;

    const finish = (dx: number, dt: number) => {
      tracking = false;
      stopSwipe();
      if (dominant !== "h") return;
      if (Math.abs(dx) < 60) return;
      if (dt > 700) return;
      onSwipe(dx < 0 ? 1 : -1);
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (!tracking) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const stepX = Math.abs(moveEvent.clientX - lastX);
      const stepY = Math.abs(moveEvent.clientY - lastY);
      if (stepX > stepY) dominant = "h";
      else if (stepY > stepX * 1.4) dominant = "v";
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      if (dominant === "v" && Math.abs(dy) > 12) {
        // Vertical motion is taking over; stop tracking and let the page scroll.
        tracking = false;
        target.releasePointerCapture?.(moveEvent.pointerId);
        stopSwipe();
        return;
      }
      if (Math.abs(dx) > 80) {
        // Far enough horizontally to commit the swipe early.
        finish(dx, moveEvent.timeStamp - startTime);
      }
    };

    const onUp = (upEvent: PointerEvent) => {
      const dx = upEvent.clientX - startX;
      finish(dx, upEvent.timeStamp - startTime);
    };

    swipeState.current = { target, onMove, onUp };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Some platforms don't allow setPointerCapture; the up/move listeners still work.
    }
  };

  return (
    <nav
      aria-label="Рубрики"
      data-more-left={edges.left || undefined}
      data-more-right={edges.right || undefined}
      className="np-cat-tabs -mx-4 px-4 lg:mx-0 lg:px-0"
    >
      <div
        ref={scroller}
        onPointerDown={onPointerDown}
        className="np-cat-tabs-scroll flex items-center gap-1.5 overflow-x-auto touch-pan-y"
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
      className={`np-cat-tab inline-flex shrink-0 items-center justify-center rounded-full border px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
        active
          ? "border-transparent bg-accent text-on-accent"
          : "border-line bg-surface text-body hover:border-accent/35 hover:text-accent dark:hover:text-link"
      }`}
    >
      {item.name}
    </Link>
  );
}