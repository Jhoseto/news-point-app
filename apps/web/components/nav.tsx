"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type SVGProps,
} from "react";
import { useReducedMotion } from "./reader-preferences";
import { createPortal } from "react-dom";
import type { CategoryRef } from "@/lib/queries";
import { currentHeaderSheet, setHeaderSheet, useHeaderSheet } from "./header-state";
import { MOBILE_OVERLAY_CHANGE, requestMobileOverlay, type MobileOverlay } from "@/lib/mobile-overlays";
import {
  BadgeIcon,
  BallotIcon,
  BoltIcon,
  BriefcaseIcon,
  ChipIcon,
  CloseIcon,
  ColumnsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CupIcon,
  EyeIcon,
  FlagIcon,
  GlobeIcon,
  GridIcon,
  HeartIcon,
  HomeIcon,
  MapIcon,
  MegaphoneIcon,
  PaletteIcon,
  PenIcon,
  PinIcon,
  SearchIcon,
  TrophyIcon,
} from "./icons";
import { openRubrics, RUBRICS_EVENT } from "./rubrics-trigger";
import { SiteSearch } from "./site-search";

type NavItem = Pick<CategoryRef, "slug" | "name" | "path">;

function scrollHomeIfCurrent(event: MouseEvent<HTMLAnchorElement>, path: string, pathname: string, reducedMotion: boolean) {
  if (path !== "/" || pathname !== "/") return;
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
}

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactNode;

const RUBRIC_ICONS: Record<string, IconComponent> = {
  plovdiv: PinIcon,
  "regionalni-novini": MapIcon,
  "na-fokus": EyeIcon,
  balgariya: FlagIcon,
  politika: ColumnsIcon,
  "kriminalni-novini": BadgeIcon,
  "ot-soczialnite-mrezhi": PenIcon,
  "svetovni-novini": GlobeIcon,
  "sportni-novini": TrophyIcon,
  tehnologii: ChipIcon,
  "biznes-novini": BriefcaseIcon,
  zdrave: HeartIcon,
  kultura: PaletteIcon,
  lajfstajl: CupIcon,
  izbori: BallotIcon,
  "glasat-na-istinata": MegaphoneIcon,
  temi: ColumnsIcon,
};

const STORIES_NAV: NavItem = { name: "Теми с продължение", path: "/temi/", slug: "temi" };

function RubricIcon({ slug, ...props }: { slug: string } & SVGProps<SVGSVGElement>) {
  const Icon = RUBRIC_ICONS[slug] ?? GridIcon;
  return <Icon {...props} />;
}

/** A quiet inset tile keeps the category icons consistent in both menu sizes. */
function RubricMark({ slug }: { slug: string }) {
  return (
    <span
      className="np-rubric-mark flex size-8 shrink-0 items-center justify-center rounded-[0.625rem] text-muted"
    >
      {slug ? <RubricIcon slug={slug} width={18} height={18} /> : <HomeIcon width={18} height={18} />}
    </span>
  );
}

/** „Близо до вас“ are the two local rubrics; the rest are also rubrics. */
const LOCAL_SLUGS = new Set(["plovdiv", "regionalni-novini"]);

function groupRubrics(items: NavItem[]) {
  const local = items.filter((item) => LOCAL_SLUGS.has(item.slug));
  const rest = items.filter((item) => !LOCAL_SLUGS.has(item.slug));
  return [
    { label: "Близо до вас", items: local },
    { label: "Още рубрики", items: rest },
  ].filter((group) => group.items.length > 0);
}

/**
 * One rubric row, shared by the desktop rail and the phone/tablet sheet so the
 * list is never duplicated. `compact` centres the icon for the collapsed rail.
 */
function RubricRow({
  item,
  current,
  onNavigate,
  compact,
}: {
  item: NavItem;
  current: string;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const active = isActive(current, item.path);
  return (
    <Link
      href={item.path}
      onClick={(event) => {
        scrollHomeIfCurrent(event, item.path, pathname, reducedMotion);
        onNavigate?.();
      }}
      aria-current={active ? "page" : undefined}
      {...(compact ? { "aria-label": item.name, "data-rubric-tip": item.name } : { title: item.name })}
      className={`np-rubric-row group relative flex shrink-0 items-center rounded-xl ${
        compact ? "np-rubric-row--compact justify-center" : "h-11 gap-2.5 px-2.5"
      }`}
    >
      <span
        className={`np-gradient-bg absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full transition-[scale,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
        }`}
        aria-hidden="true"
      />
      <RubricMark slug={item.slug} />
      {compact ? null : (
        <span
          className={`np-rubric-label min-w-0 flex-1 truncate text-[0.875rem] tracking-tight transition-colors duration-200 ${
            active ? "font-semibold text-ink" : "font-medium text-body group-hover:text-ink"
          }`}
        >
          {item.name}
        </span>
      )}
      {compact ? null : <ChevronRightIcon className="np-rubric-chevron shrink-0" width={13} height={13} aria-hidden="true" />}
    </Link>
  );
}

/** Desktop expanded rail: «Начало» + «Свий» as one row (split control). */
function HomeRubricBar({
  current,
  collapseBtn,
  onCollapse,
}: {
  current: string;
  collapseBtn: RefObject<HTMLButtonElement | null>;
  onCollapse: () => void;
}) {
  const home: NavItem = { name: "Начало", path: "/", slug: "" };
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const active = isActive(current, home.path);
  return (
    <div className="np-rubric-home-bar flex h-12 min-h-[48px] w-full rounded-xl lg:h-[var(--np-home-bar-h)] lg:min-h-0" aria-current={active ? "page" : undefined}>
      <Link
        href={home.path}
        title={home.name}
        onClick={(event) => scrollHomeIfCurrent(event, home.path, pathname, reducedMotion)}
        className="np-rubric-home-link group relative flex h-full min-w-0 flex-1 items-center gap-2.5 px-2.5"
      >
        <span
          className={`np-gradient-bg absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full transition-[scale,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
          }`}
          aria-hidden="true"
        />
        <RubricMark slug={home.slug} />
        <span
          className={`np-rubric-label min-w-0 flex-1 truncate text-[0.875rem] tracking-tight transition-colors duration-200 ${
            active ? "font-semibold text-ink" : "font-medium text-body group-hover:text-ink"
          }`}
        >
          {home.name}
        </span>
      </Link>
      <button
        ref={collapseBtn}
        type="button"
        data-rubrics-trigger
        aria-expanded={true}
        onClick={onCollapse}
        aria-label="Свий менюто с рубрики"
        title="Свий менюто"
        className="np-rubric-home-collapse inline-flex h-full min-w-[48px] w-12 shrink-0 items-center justify-center text-muted lg:w-[var(--np-home-bar-h)]"
      >
        <ChevronLeftIcon width={22} height={22} strokeWidth={2.25} aria-hidden="true" />
      </button>
    </div>
  );
}

const SEARCH_EVENT = "np:search";
const DESKTOP = "(min-width: 64rem)";

export { openRubrics } from "./rubrics-trigger";

export function openSearch() {
  if (!requestMobileOverlay("search")) return;
  window.dispatchEvent(new CustomEvent(SEARCH_EVENT));
}

function isActive(current: string, path: string) {
  return path === "/" ? current === "/" : current.startsWith(path);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

type SheetCloseMode = "pop" | "navigate";

/** Drop the synthetic sheet entry without leaving the destination the user chose. */
function stripSheetHistory(sheet: "rubrics" | "search") {
  if (history.state?.npSheet !== sheet) return;
  const state = { ...history.state };
  delete state.npSheet;
  history.replaceState(state, "");
}

/** Desktop modal; on phones the focus loop also includes the usable bottom menu. */
function useModal(open: boolean, close: () => void, panel: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    // Focus moves in only after the opener is recorded; `autoFocus` would run first.
    (panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab" && panel.current) {
        const mobile = matchMedia("(max-width: 63.999rem)").matches;
        const menu = mobile ? document.querySelector<HTMLElement>(".np-bottom-nav") : null;
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE),
          ...(menu?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
          .filter((item) => item.offsetParent !== null && (!mobile || !item.closest("[inert]")));
        const first = items[0];
        const last = items.at(-1);
        if (!first || !last) return;
        if (mobile) {
          // Portals and the bottom menu have a different DOM order; own each Tab step.
          const index = items.indexOf(document.activeElement as HTMLElement);
          const next = index < 0 ? (event.shiftKey ? items.length - 1 : 0)
            : (index + (event.shiftKey ? items.length - 1 : 1)) % items.length;
          event.preventDefault(); items[next]?.focus(); return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, close, panel]);
}

function Sheet({ open, onClose, label, side, children }: { open: boolean; onClose: () => void; label: string; side: "left" | "top"; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = matchMedia("(max-width: 63.999rem)");
    const update = () => setMobile(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useModal(open, onClose, panel);

  // On iPhones the keyboard shrinks the visual viewport without changing 100dvh.
  // We expose visualViewport.height as a CSS variable so max-h tracks the keyboard.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      document.documentElement.style.setProperty("--np-vp-viewport", `${Math.round(vv.height)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--np-vp-viewport");
    };
  }, [open]);
  if (!open) return null;
  // Portal: the header's backdrop-filter would otherwise contain this fixed layer.
  return createPortal(
    <div className="np-mobile-nav-sheet-root fixed inset-0 z-50" role="dialog" aria-modal={mobile ? undefined : true} aria-label={label}>
      <div
        className="np-sheet-backdrop absolute inset-x-0 top-0 bg-[#000516]/60"
        aria-hidden="true"
        onClick={onClose}
        style={{ bottom: "var(--np-bottom-nav-h, 0px)" }}
      />
      <div
        ref={panel}
        className={
          side === "left"
            ? "np-sheet-left absolute inset-y-0 left-0 flex w-[min(21rem,86vw)] flex-col overflow-y-auto border-r border-line bg-surface shadow-card lg:bottom-auto"
            : "np-sheet-top absolute inset-x-0 top-0 flex max-h-[calc(var(--np-vp-viewport,100dvh)-var(--np-bottom-nav-h))] flex-col overflow-y-auto rounded-b-3xl border-b border-line bg-surface shadow-card"
        }
        style={side === "left" ? { bottom: "var(--np-bottom-nav-h, 0px)" } : undefined}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function RubricLinks({ items, current, onNavigate, autoFocusActive }: { items: NavItem[]; current: string; onNavigate: () => void; autoFocusActive?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoFocusActive) return;
    const target = root.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? root.current?.querySelector<HTMLElement>("a");
    target?.focus({ preventScroll: true });
  }, [autoFocusActive]);

  const home: NavItem = { name: "Начало", path: "/", slug: "" };
  return (
    <div ref={root} className="flex flex-col">
      <ul className="flex flex-col gap-1">
        <li key={home.path}>
          <RubricRow item={home} current={current} onNavigate={onNavigate} />
        </li>
      </ul>
      {groupRubrics(items).map((group) => (
        <div key={group.label} className="mt-3">
          <p className="np-rubrics-group flex items-center gap-2 px-3 pb-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-muted uppercase">{group.label}</p>
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => (
              <li key={item.path}>
                <RubricRow item={item} current={current} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ul className="mt-1 flex flex-col gap-1">
        <li>
          <RubricRow item={STORIES_NAV} current={current} onNavigate={onNavigate} />
        </li>
      </ul>
    </div>
  );
}

/**
 * Phone/tablet rubrics sheet. Lives in MobileChromeIsland because exclusive
 * Client Hints SSR no longer mounts RubricsNav on mobile.
 */
export function MobileRubricsSheet({ items }: { items: NavItem[] }) {
  const current = usePathname() ?? "/";
  const [sheetOpen, setSheetOpen] = useState(false);
  const ownedEntry = useRef(false);

  const closeSheet = useCallback((mode: SheetCloseMode = "pop") => {
    if (!sheetOpen) return;
    setSheetOpen(false);
    setHeaderSheet(null);
    if (!ownedEntry.current) return;
    ownedEntry.current = false;
    if (mode === "pop") history.back();
    else stripSheetHistory("rubrics");
  }, [sheetOpen]);

  useEffect(() => {
    if (!sheetOpen) return;
    const switchPanel = (event: Event) => {
      if ((event as CustomEvent<MobileOverlay>).detail === "rubrics") return;
      ownedEntry.current = false;
      setSheetOpen(false);
      if (currentHeaderSheet() === "rubrics") setHeaderSheet(null);
      if (history.state?.npSheet === "rubrics") {
        const state = { ...history.state }; delete state.npSheet; history.replaceState(state, "");
      }
    };
    window.addEventListener(MOBILE_OVERLAY_CHANGE, switchPanel);
    return () => window.removeEventListener(MOBILE_OVERLAY_CHANGE, switchPanel);
  }, [sheetOpen]);

  const openSheet = useCallback(() => {
    if (matchMedia(DESKTOP).matches) return;
    setSheetOpen(true);
    const other = currentHeaderSheet();
    setHeaderSheet("rubrics");
    if (other === null) {
      history.pushState({ npSheet: "rubrics" }, "");
      ownedEntry.current = true;
    } else {
      ownedEntry.current = false;
    }
  }, []);

  const pathWhenSheetOpened = useRef(current);
  useEffect(() => {
    if (!sheetOpen) {
      pathWhenSheetOpened.current = current;
      return;
    }
    if (pathWhenSheetOpened.current === current) return;
    pathWhenSheetOpened.current = current;
    closeSheet("navigate");
  }, [current, sheetOpen, closeSheet]);

  useEffect(() => {
    window.addEventListener(RUBRICS_EVENT, openSheet);
    return () => window.removeEventListener(RUBRICS_EVENT, openSheet);
  }, [openSheet]);

  useEffect(() => {
    const onPop = () => {
      if (!ownedEntry.current) return;
      ownedEntry.current = false;
      setSheetOpen(false);
      setHeaderSheet(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <Sheet open={sheetOpen} onClose={() => closeSheet("pop")} label="Рубрики" side="left">
      <div className="flex shrink-0 items-center justify-end border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={() => closeSheet("pop")}
          aria-label="Затвори менюто"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2"
          data-autofocus
        >
          <CloseIcon width={22} height={22} />
        </button>
      </div>
      <nav aria-label="Рубрики" className="flex-1 overflow-y-auto p-3 pt-4 pb-5">
        <RubricLinks items={items} current={current} onNavigate={() => closeSheet("navigate")} />
      </nav>
    </Sheet>
  );
}

/**
 * Desktop rubrics rail (icon-only when collapsed). Mobile sheet is MobileRubricsSheet.
 */
export function RubricsNav({ items }: { items: NavItem[] }) {
  const current = usePathname() ?? "/";
  const [expanded, setExpanded] = useState(true);
  const [compactTip, setCompactTip] = useState<{ label: string; x: number; y: number } | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipPortalReady, setTipPortalReady] = useState(false);
  const collapseBtn = useRef<HTMLButtonElement>(null);
  const expandBtn = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const tipOpenRef = useRef(false);
  const compactTipRef = useRef(compactTip);
  const tipOpenFrame = useRef(0);
  const tipHideTimer = useRef(0);
  const focusCollapse = useRef(false);

  const TIP_HIDE_MS = 400;

  useEffect(() => {
    tipOpenRef.current = tipOpen;
  }, [tipOpen]);

  useEffect(() => {
    compactTipRef.current = compactTip;
  }, [compactTip]);

  useEffect(() => {
    setTipPortalReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-rubrics-closed", !expanded);
    if (expanded) {
      if (tipOpenFrame.current) cancelAnimationFrame(tipOpenFrame.current);
      tipOpenFrame.current = 0;
      if (tipHideTimer.current) window.clearTimeout(tipHideTimer.current);
      tipHideTimer.current = 0;
      tipOpenRef.current = false;
      setTipOpen(false);
      setCompactTip(null);
      compactTipRef.current = null;
    }
    return () => document.documentElement.removeAttribute("data-rubrics-closed");
  }, [expanded]);

  // Focus follows the toggle so keyboard users never land on an unmounted button.
  useEffect(() => {
    if (expanded) {
      if (focusCollapse.current) {
        focusCollapse.current = false;
        collapseBtn.current?.focus({ preventScroll: true });
      }
    } else {
      expandBtn.current?.focus({ preventScroll: true });
    }
  }, [expanded]);

  useEffect(() => {
    const onOpen = () => {
      if (matchMedia(DESKTOP).matches) setExpanded(true);
    };
    window.addEventListener(RUBRICS_EVENT, onOpen);
    return () => window.removeEventListener(RUBRICS_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape belongs to an open dialog; closing LivePoint/settings must not also collapse the rail.
      if (document.querySelector('[aria-modal="true"], dialog[open]')) return;
      setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  const groups = groupRubrics(items);

  const clearTipHideTimer = useCallback(() => {
    if (!tipHideTimer.current) return;
    window.clearTimeout(tipHideTimer.current);
    tipHideTimer.current = 0;
  }, []);

  const showCompactTip = useCallback(
    (next: { label: string; x: number; y: number }) => {
      clearTipHideTimer();
      if (tipOpenFrame.current) cancelAnimationFrame(tipOpenFrame.current);
      tipOpenFrame.current = 0;
      setCompactTip(next);
      compactTipRef.current = next;
      tipOpenRef.current = true;
      setTipOpen(true);
    },
    [clearTipHideTimer],
  );

  const hideCompactTip = useCallback(() => {
    if (!compactTipRef.current) return;
    if (tipOpenFrame.current) cancelAnimationFrame(tipOpenFrame.current);
    tipOpenFrame.current = 0;
    tipOpenRef.current = false;
    setTipOpen(false);
    clearTipHideTimer();
    tipHideTimer.current = window.setTimeout(() => {
      tipHideTimer.current = 0;
      if (tipOpenRef.current) return;
      setCompactTip(null);
      compactTipRef.current = null;
    }, TIP_HIDE_MS);
  }, [clearTipHideTimer]);

  const syncCompactTip = useCallback(
    (target: EventTarget | null) => {
      const element =
        target instanceof Element ? target.closest<HTMLElement>("[data-rubric-tip]") : null;
      if (!element) {
        hideCompactTip();
        return;
      }
      const label = element.dataset.rubricTip;
      if (!label) {
        hideCompactTip();
        return;
      }
      const rect = element.getBoundingClientRect();
      const next = { label, x: rect.right + 10, y: rect.top + rect.height / 2 };
      showCompactTip(next);
    },
    [hideCompactTip, showCompactTip],
  );

  const onCollapsedNavPointerOver = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (expanded) return;
      syncCompactTip(event.target);
    },
    [expanded, syncCompactTip],
  );

  const onCollapsedNavPointerOut = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (expanded) return;
      const next = event.relatedTarget;
      if (next instanceof Node && navRef.current?.contains(next)) return;
      hideCompactTip();
    },
    [expanded, hideCompactTip],
  );

  const onCollapsedNavFocusIn = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (expanded) return;
      syncCompactTip(event.target);
    },
    [expanded, syncCompactTip],
  );

  const onCollapsedNavFocusOut = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (expanded) return;
      const next = event.relatedTarget;
      if (next instanceof Node && navRef.current?.contains(next)) return;
      hideCompactTip();
    },
    [expanded, hideCompactTip],
  );

  return (
    <>
      <aside
        aria-label="Рубрики"
        data-expanded={expanded ? "" : undefined}
        className="np-rubrics-rail sticky top-[var(--np-bar-h)] z-40 hidden h-[calc(100dvh-var(--np-bar-h))] w-[var(--np-rail-w)] shrink-0 flex-col lg:flex"
      >
        <nav
          ref={navRef}
          aria-label="Рубрики"
          className="np-rubrics-nav flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-3 pb-3 lg:pt-0"
          {...(!expanded
            ? {
                onPointerOver: onCollapsedNavPointerOver,
                onPointerOut: onCollapsedNavPointerOut,
                onFocusCapture: onCollapsedNavFocusIn,
                onBlurCapture: onCollapsedNavFocusOut,
              }
            : {})}
        >
          {expanded ? (
            <div className="np-rubric-home-slot">
              <HomeRubricBar current={current} collapseBtn={collapseBtn} onCollapse={() => setExpanded(false)} />
            </div>
          ) : (
            <div className="np-rubrics-collapsed-head mb-1 flex flex-col items-center gap-1 lg:min-h-[var(--np-lp-row-h)] lg:justify-center lg:pb-1">
              <button
                ref={expandBtn}
                type="button"
                data-rubrics-trigger
                aria-expanded={expanded}
                onClick={() => {
                  focusCollapse.current = true;
                  setExpanded(true);
                }}
                data-rubric-tip="Разгъни менюто"
                aria-label="Разгъни менюто"
                className="np-rubrics-toggle np-rubrics-toggle--compact inline-flex items-center justify-center rounded-[0.5rem] text-muted"
              >
                <ChevronRightIcon width={18} height={18} strokeWidth={2.25} aria-hidden="true" />
              </button>
              <ul className="flex w-full flex-col gap-px">
                <li>
                  <RubricRow item={{ name: "Начало", path: "/", slug: "" }} current={current} compact />
                </li>
              </ul>
            </div>
          )}
          <div className="np-rubrics-nav-body min-h-0 flex-1">
          {groups.map((group, groupIndex) => (
            <section key={group.label} className={groupIndex > 0 ? (expanded ? "mt-4" : "mt-2") : undefined}>
              {expanded ? (
                <h3 className="np-rubrics-group flex items-center gap-2 px-3 pb-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-muted uppercase">{group.label}</h3>
              ) : groupIndex > 0 ? (
                <div className="np-rubrics-collapsed-divider mx-auto h-px w-4 bg-line" aria-hidden="true" />
              ) : null}
              <ul className={`flex flex-col ${expanded ? "gap-0.5" : "gap-px"}`}>
                {group.items.map((item) => (
                  <li key={item.path}>
                    <RubricRow item={item} current={current} compact={!expanded} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
            <ul className={`mt-0.5 flex flex-col ${expanded ? "gap-0.5" : "gap-px"}`}>
              <li>
                <RubricRow item={STORIES_NAV} current={current} compact={!expanded} />
              </li>
            </ul>
          </div>
        </nav>
      </aside>
      {tipPortalReady && !expanded && compactTip
        ? createPortal(
            <div
              role="tooltip"
              data-open={tipOpen || undefined}
              className="np-rubric-float-tip"
              style={{ top: compactTip.y, left: compactTip.x }}
            >
              {compactTip.label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Search on screens without the centred header field. */
export function MobileSearch({ showHeaderTrigger = true }: { showHeaderTrigger?: boolean }) {
  const [open, setOpen] = useState(false);
  const ownedEntry = useRef(false);
  const current = usePathname();

  const openSheet = useCallback(() => {
    setOpen(true);
    const other = currentHeaderSheet();
    setHeaderSheet("search");
    if (other === null) {
      history.pushState({ npSheet: "search" }, "");
      ownedEntry.current = true;
    } else {
      ownedEntry.current = false;
    }
  }, []);

  const close = useCallback((mode: SheetCloseMode = "pop") => {
    if (!open) return;
    setOpen(false);
    setHeaderSheet(null);
    if (!ownedEntry.current) return;
    ownedEntry.current = false;
    if (mode === "pop") history.back();
    else stripSheetHistory("search");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const switchPanel = (event: Event) => {
      if ((event as CustomEvent<MobileOverlay>).detail === "search") return;
      ownedEntry.current = false;
      setOpen(false);
      if (currentHeaderSheet() === "search") setHeaderSheet(null);
      if (history.state?.npSheet === "search") {
        const state = { ...history.state }; delete state.npSheet; history.replaceState(state, "");
      }
    };
    window.addEventListener(MOBILE_OVERLAY_CHANGE, switchPanel);
    return () => window.removeEventListener(MOBILE_OVERLAY_CHANGE, switchPanel);
  }, [open]);

  const pathWhenSearchOpened = useRef(current);
  useEffect(() => {
    if (!open) {
      pathWhenSearchOpened.current = current ?? "/";
      return;
    }
    const path = current ?? "/";
    if (pathWhenSearchOpened.current === path) return;
    pathWhenSearchOpened.current = path;
    close("navigate");
  }, [current, open, close]);

  useEffect(() => {
    const onOpen = () => openSheet();
    window.addEventListener(SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(SEARCH_EVENT, onOpen);
  }, [openSheet]);

  useEffect(() => {
    const onPop = () => {
      if (!ownedEntry.current) return;
      ownedEntry.current = false;
      setOpen(false);
      setHeaderSheet(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <>
      {showHeaderTrigger ? (
        <button
          type="button"
          onClick={openSearch}
          aria-label="Търсене"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2 lg:hidden"
        >
          <SearchIcon width={21} height={21} />
        </button>
      ) : null}
      <Sheet open={open} onClose={() => close("pop")} label="Търсене" side="top">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <span className="text-xs font-extrabold tracking-[0.14em] text-muted uppercase">Търсене</span>
          <button type="button" onClick={() => close("pop")} aria-label="Затвори търсенето" className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-surface-2">
            <CloseIcon width={22} height={22} />
          </button>
        </div>
        <div className="px-4 pt-2 pb-5">
          <SiteSearch variant="sheet" autoFocus onNavigate={() => close("navigate")} />
        </div>
      </Sheet>
    </>
  );
}

export function BottomNav({ onOpenLatest, latestOpen = false, onNavigate }: {
  onOpenLatest?: () => void;
  latestOpen?: boolean;
  onNavigate?: () => void;
} = {}) {
  const current = usePathname() ?? "/";
  const sheet = useHeaderSheet();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => {
      // Mobile keyboards are ≥150 px on phones; the system UI alone is below that.
      const delta = window.innerHeight - vv.height;
      setKeyboardOpen(delta > 150);
    };
    check();
    vv.addEventListener("resize", check);
    window.addEventListener("resize", check);
    return () => {
      vv.removeEventListener("resize", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  const onHome =
    current === "/" && !sheet && !latestOpen && !current.startsWith("/#");
  const latestActive = latestOpen;
  const searchActive = sheet === "search";
  const rubricsActive = sheet === "rubrics";
  const itemClass =
    "relative flex min-h-11 flex-1 flex-col items-center gap-1 py-2 text-[0.6875rem] font-semibold text-muted aria-[current=page]:text-accent dark:aria-[current=page]:text-link";

  return (
    <nav
      aria-label="Бърза навигация"
      data-keyboard-open={keyboardOpen || undefined}
      className="np-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-md">
        <Link href="/" onClick={(event) => { if (!requestMobileOverlay("home")) event.preventDefault(); else onNavigate?.(); }} aria-current={onHome ? "page" : undefined} className={itemClass}>
          <span aria-hidden="true" className="np-bottom-nav-mark" />
          <HomeIcon width={21} height={21} />
          Начало
        </Link>
        <button
          type="button"
          onClick={() => { if (requestMobileOverlay("latest")) onOpenLatest?.(); }}
          data-active={latestActive || undefined}
          aria-expanded={latestActive}
          aria-controls={latestActive ? "np-mobile-latest-panel" : undefined}
          className={itemClass}
        >
          <span aria-hidden="true" className="np-bottom-nav-mark" />
          <BoltIcon width={21} height={21} />
          Последни
        </button>
        <button
          type="button"
          onClick={() => { onNavigate?.(); openSearch(); }}
          data-active={searchActive || undefined}
          aria-pressed={searchActive}
          className={itemClass}
        >
          <span aria-hidden="true" className="np-bottom-nav-mark" />
          <SearchIcon width={21} height={21} />
          Търсене
        </button>
        <button
          type="button"
          onClick={() => { onNavigate?.(); openRubrics(); }}
          data-active={rubricsActive || undefined}
          aria-pressed={rubricsActive}
          className={itemClass}
        >
          <span aria-hidden="true" className="np-bottom-nav-mark" />
          <GridIcon width={21} height={21} />
          Рубрики
        </button>
      </div>
    </nav>
  );
}
