"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject, type SVGProps } from "react";
import { createPortal } from "react-dom";
import type { CategoryRef } from "@/lib/queries";
import {
  BadgeIcon,
  BallotIcon,
  BoltIcon,
  BriefcaseIcon,
  ChevronLeftIcon,
  ChipIcon,
  CloseIcon,
  ColumnsIcon,
  CupIcon,
  FlagIcon,
  GlobeIcon,
  GridIcon,
  HeartIcon,
  HomeIcon,
  MapIcon,
  PaletteIcon,
  PenIcon,
  PinIcon,
  SearchIcon,
  TrophyIcon,
} from "./icons";
import { SiteSearch } from "./site-search";
import { ThemeChoice } from "./theme";

type NavItem = Pick<CategoryRef, "slug" | "name" | "path">;

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactNode;

const RUBRIC_ICONS: Record<string, IconComponent> = {
  plovdiv: PinIcon,
  "regionalni-novini": MapIcon,
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
};

function RubricIcon({ slug, ...props }: { slug: string } & SVGProps<SVGSVGElement>) {
  const Icon = RUBRIC_ICONS[slug] ?? GridIcon;
  return <Icon {...props} />;
}

/** Bare icon. The active one takes the brand violet; nothing draws a box around it. */
function RubricMark({ slug, active }: { slug: string; active: boolean }) {
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center transition-colors ${
        active ? "text-accent dark:text-link" : "text-muted group-hover:text-accent dark:group-hover:text-link"
      }`}
    >
      {slug ? <RubricIcon slug={slug} width={18} height={18} /> : <HomeIcon width={18} height={18} />}
    </span>
  );
}

const RUBRICS_EVENT = "np:rubrics";
const SEARCH_EVENT = "np:search";
const DESKTOP = "(min-width: 64rem)";

export function openRubrics() {
  window.dispatchEvent(new CustomEvent(RUBRICS_EVENT));
}

export function openSearch() {
  window.dispatchEvent(new CustomEvent(SEARCH_EVENT));
}

function isActive(current: string, path: string) {
  return path === "/" ? current === "/" : current.startsWith(path);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modal sheet: Escape and the close button close it, Tab stays inside, focus returns to the opener. */
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
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null);
        const first = items[0];
        const last = items.at(-1);
        if (!first || !last) return;
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
  useModal(open, onClose, panel);
  if (!open) return null;
  // Portal: the header's backdrop-filter would otherwise contain this fixed layer.
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <div className="np-sheet-backdrop absolute inset-0 bg-[#000516]/55 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        className={
          side === "left"
            ? "np-sheet-left absolute inset-y-0 left-0 flex w-[min(21rem,86vw)] flex-col overflow-y-auto border-r border-line bg-surface shadow-card"
            : "np-sheet-top absolute inset-x-0 top-0 flex max-h-[92dvh] flex-col overflow-y-auto rounded-b-3xl border-b border-line bg-surface shadow-card"
        }
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function RubricLinks({ items, current, onNavigate, autoFocusActive }: { items: NavItem[]; current: string; onNavigate: () => void; autoFocusActive?: boolean }) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!autoFocusActive) return;
    const target = list.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? list.current?.querySelector<HTMLElement>("a");
    target?.focus({ preventScroll: true });
  }, [autoFocusActive]);

  return (
    <ul ref={list} className="flex flex-col">
      {[{ name: "Начало", path: "/", slug: "" }, ...items].map((item) => {
        const active = isActive(current, item.path);
        return (
          <li key={item.path}>
            <Link
              href={item.path}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className="group relative flex h-10 items-center gap-1 rounded-lg pr-2 pl-1 text-[0.9375rem] font-semibold text-body transition-colors hover:bg-surface-2 hover:text-ink aria-[current=page]:bg-surface-2 aria-[current=page]:text-ink"
            >
              <RubricMark slug={item.slug} active={active} />
              {item.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Rubrics navigation.
 * Desktop: a narrow rail with a "Рубрики" button; the list opens as a panel beside
 * it and does not move the page. Phone and tablet: a sheet from the left.
 */
export function RubricsNav({ items }: { items: NavItem[] }) {
  const current = usePathname() ?? "/";
  const [expanded, setExpanded] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  useEffect(() => setSheetOpen(false), [current]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-rubrics-closed", !expanded);
    return () => document.documentElement.removeAttribute("data-rubrics-closed");
  }, [expanded]);

  useEffect(() => {
    const onOpen = () => {
      if (matchMedia(DESKTOP).matches) setExpanded(true);
      else setSheetOpen(true);
    };
    window.addEventListener(RUBRICS_EVENT, onOpen);
    return () => window.removeEventListener(RUBRICS_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <>
      <aside
        aria-label="Рубрики"
        className={`sticky top-[var(--np-bar-h)] z-40 -mt-12 hidden h-[calc(100dvh-var(--np-bar-h))] shrink-0 flex-col border-r border-line bg-[linear-gradient(to_bottom,transparent_1px,var(--np-surface)_1px)] backdrop-blur transition-[width] duration-200 ease-out lg:flex ${
          expanded ? "w-[16.5rem]" : "w-[4.25rem]"
        }`}
      >
        <div className={`flex h-12 shrink-0 items-center ${expanded ? "gap-2.5 px-3" : "justify-center"}`}>
          <button
            ref={trigger}
            type="button"
            data-rubrics-trigger
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            aria-label={expanded ? "Сгъни рубриките" : "Разгъни рубриките"}
            className="group inline-flex items-center gap-2.5 rounded-lg text-ink"
          >
            <span className="flex size-8 items-center justify-center text-accent dark:text-link">
              <ChevronLeftIcon width={16} height={16} className={`transition-transform duration-200 ${expanded ? "" : "rotate-180"}`} />
            </span>
            {expanded ? (
              <span className="flex items-center gap-2 text-[0.65rem] font-extrabold tracking-[0.18em] text-muted uppercase">
                <span className="np-ring !size-3" aria-hidden="true" />
                Рубрики
              </span>
            ) : null}
          </button>
        </div>
        <nav aria-label="Рубрики" className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-1.5 py-1.5">
          {items.map((item) => {
            const active = isActive(current, item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={active ? "page" : undefined}
                title={item.name}
                aria-label={expanded ? undefined : item.name}
                className={`group relative flex h-9 shrink-0 items-center rounded-lg transition-colors hover:bg-surface-2 aria-[current=page]:bg-surface-2 ${
                  expanded ? "gap-1 pr-2 pl-1" : "justify-center"
                }`}
              >
                <span className={`np-gradient-bg absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full ${active ? "" : "hidden"}`} aria-hidden="true" />
                <RubricMark slug={item.slug} active={active} />
                {expanded ? <span className="truncate text-[0.8125rem] font-semibold tracking-tight text-ink">{item.name}</span> : null}
              </Link>
            );
          })}
        </nav>
      </aside>

      <Sheet open={sheetOpen} onClose={closeSheet} label="Рубрики" side="left">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <span className="text-xs font-extrabold tracking-[0.14em] text-muted uppercase">Рубрики</span>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Затвори менюто"
            className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-surface-2"
            data-autofocus
          >
            <CloseIcon width={22} height={22} />
          </button>
        </div>
        <nav aria-label="Рубрики" className="flex-1 p-3">
          <RubricLinks items={items} current={current} onNavigate={closeSheet} />
        </nav>
        <div className="flex flex-col gap-2 border-t border-line p-5">
          <span className="text-xs font-extrabold tracking-[0.14em] text-muted uppercase">Режим</span>
          <ThemeChoice />
        </div>
      </Sheet>
    </>
  );
}

/** Phone and tablet header button; desktop uses the rail. */
export function RubricsButton() {
  return (
    <button
      type="button"
      onClick={openRubrics}
      data-rubrics-trigger
      aria-label="Рубрики"
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2 lg:hidden"
    >
      <GridIcon width={21} height={21} />
    </button>
  );
}

/** Search on screens without the centred header field. */
export function MobileSearch() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const current = usePathname();

  useEffect(() => setOpen(false), [current]);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(SEARCH_EVENT, onOpen);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Търсене"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2 lg:hidden"
      >
        <SearchIcon width={21} height={21} />
      </button>
      <Sheet open={open} onClose={close} label="Търсене" side="top">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <span className="text-xs font-extrabold tracking-[0.14em] text-muted uppercase">Търсене</span>
          <button type="button" onClick={close} aria-label="Затвори търсенето" className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-surface-2">
            <CloseIcon width={22} height={22} />
          </button>
        </div>
        <div className="px-4 pt-2 pb-5">
          <SiteSearch variant="sheet" autoFocus onNavigate={close} />
        </div>
      </Sheet>
    </>
  );
}

export function BottomNav() {
  const current = usePathname() ?? "/";
  const itemClass =
    "flex flex-1 flex-col items-center gap-1 py-2 text-[0.6875rem] font-semibold text-muted aria-[current=page]:text-accent dark:aria-[current=page]:text-link";
  return (
    <nav
      aria-label="Бърза навигация"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-md">
        <Link href="/" aria-current={current === "/" ? "page" : undefined} className={itemClass}>
          <HomeIcon width={21} height={21} />
          Начало
        </Link>
        <Link href="/#posledni" className={itemClass}>
          <BoltIcon width={21} height={21} />
          Последни
        </Link>
        <button type="button" onClick={openSearch} className={itemClass}>
          <SearchIcon width={21} height={21} />
          Търсене
        </button>
        <button type="button" onClick={openRubrics} className={itemClass}>
          <GridIcon width={21} height={21} />
          Рубрики
        </button>
      </div>
    </nav>
  );
}
