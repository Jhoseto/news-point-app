"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MOBILE_RUBRIC_NAVIGATE, MOBILE_RUBRIC_STATUS, mobileRoutePath, mobileRubrics, rubricRoute, type MobileRubric } from "@/lib/mobile-rubric-nav";

export function MobileRubricTabs({ menu }: { menu: MobileRubric[] }) {
  const pathname = usePathname() ?? "/";
  const items = mobileRubrics(menu);
  const route = rubricRoute(pathname, items);
  const row = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const status = (event: Event) => setPending((event as CustomEvent<{ pending: string | null }>).detail.pending);
    window.addEventListener(MOBILE_RUBRIC_STATUS, status);
    return () => window.removeEventListener(MOBILE_RUBRIC_STATUS, status);
  }, []);
  useEffect(() => {
    if (!matchMedia("(max-width: 63.999rem)").matches) return;
    const element = row.current, active = element?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!element || !active) return;
    const left = active.offsetLeft, right = left + active.offsetWidth;
    if (left < element.scrollLeft || right > element.scrollLeft + element.clientWidth) {
      const reduced = document.documentElement.dataset.reducedMotion === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollTo({ left: Math.max(0, left - (element.clientWidth - active.offsetWidth) / 2), behavior: reduced ? "instant" : "smooth" });
    }
  }, [pathname]);
  if (route.index < 0) return null;
  return <nav className="np-mobile-rubric-tabs lg:hidden" aria-label="Новини по рубрики" data-mobile-pager-ignore aria-busy={!!pending}>
    <div ref={row} className="np-mobile-rubric-tabs-scroll">{items.map((item, index) => <Link key={item.path} href={item.path} prefetch={false}
      aria-current={index === route.index ? "page" : undefined} data-pending={pending === item.path || undefined}
      onClick={event => {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !matchMedia("(max-width: 63.999rem)").matches) return;
        if (mobileRoutePath(pathname) === item.path && !pending) { event.preventDefault(); return; }
        if (!window.dispatchEvent(new CustomEvent(MOBILE_RUBRIC_NAVIGATE, { detail: item.path, cancelable: true }))) event.preventDefault();
      }}>{item.name}<span aria-hidden="true" className="np-mobile-rubric-tab-line" /></Link>)}</div>
  </nav>;
}
