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
  ChipIcon,
  CloseIcon,
  ColumnsIcon,
  ChevronRightIcon,
  CupIcon,
  FlagIcon,
  GlobeIcon,
  GridIcon,
  HeartIcon,
  HomeIcon,
  MapIcon,
  PaletteIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
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

/** „Близо до вас“ are the two local rubrics; everything the menu supplies beyond them goes under „Всички теми“. */
const LOCAL_SLUGS = new Set(["plovdiv", "regionalni-novini"]);

function groupRubrics(items: NavItem[]) {
  const local = items.filter((item) => LOCAL_SLUGS.has(item.slug));
  const rest = items.filter((item) => !LOCAL_SLUGS.has(item.slug));
  return [
    { label: "Близо до вас", items: local },
    { label: "Всички теми", items: rest },
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
  const active = isActive(current, item.path);
  return (
    <Link
      href={item.path}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      aria-current={active ? "page" : undefined}
      title={item.name}
      aria-label={compact ? item.name : undefined}
      className={`np-rubric-row group relative flex h-11 shrink-0 items-center rounded-xl ${
        compact ? "justify-center" : "gap-2.5 px-2.5"
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
          className={`min-w-0 flex-1 truncate text-[0.875rem] tracking-tight transition-colors duration-200 ${
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
          <p className="np-rubrics-group flex items-center gap-2 px-3 pb-2 text-[0.625rem] font-semibold tracking-[0.14em] text-muted uppercase">{group.label}</p>
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => (
              <li key={item.path}>
                <RubricRow item={item} current={current} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Rubrics navigation.
 * Desktop: an in-flow rail with an icon-only collapsed state.
 * Phone and tablet: a sheet from the left.
 */
export function RubricsNav({ items }: { items: NavItem[] }) {
  const current = usePathname() ?? "/";
  const [expanded, setExpanded] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const collapseBtn = useRef<HTMLButtonElement>(null);
  const expandBtn = useRef<HTMLButtonElement>(null);
  const focusCollapse = useRef(false);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  useEffect(() => setSheetOpen(false), [current]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-rubrics-closed", !expanded);
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
      else setSheetOpen(true);
    };
    window.addEventListener(RUBRICS_EVENT, onOpen);
    return () => window.removeEventListener(RUBRICS_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  const groups = groupRubrics(items);

  return (
    <>
      <aside
        aria-label="Рубрики"
        className={`np-rubrics-rail sticky top-[var(--np-bar-h)] z-40 -mt-12 hidden h-[calc(100dvh-var(--np-bar-h))] shrink-0 flex-col lg:flex ${
          expanded ? "w-[16.5rem]" : "w-[4.25rem]"
        }`}
      >
        {expanded ? (
          <div className="np-rubrics-heading mx-4 shrink-0 pt-4 pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-[1.375rem] leading-tight font-bold tracking-tight text-ink">Рубрики</h2>
                <p className="mt-1 text-[0.6875rem] font-medium tracking-wide text-muted">Новините по теми</p>
              </div>
              <button
                ref={collapseBtn}
                type="button"
                data-rubrics-trigger
                aria-expanded={expanded}
                onClick={() => setExpanded(false)}
                aria-label="Свий менюто"
                title="Свий менюто"
                className="np-rubrics-toggle mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[0.625rem] text-muted"
              >
                <PanelLeftCloseIcon width={17} height={17} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 justify-center pt-3 pb-1">
            <button
              ref={expandBtn}
              type="button"
              data-rubrics-trigger
              aria-expanded={expanded}
              onClick={() => {
                focusCollapse.current = true;
                setExpanded(true);
              }}
              aria-label="Разгъни менюто"
              title="Разгъни менюто"
              className="np-rubrics-toggle inline-flex size-9 items-center justify-center rounded-[0.625rem] text-muted"
            >
              <PanelLeftOpenIcon width={18} height={18} />
            </button>
          </div>
        )}
        <nav aria-label="Рубрики" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-2.5 pb-3">
          {groups.map((group, groupIndex) => (
            <section key={group.label} className={groupIndex > 0 ? "mt-4" : undefined}>
              {expanded ? (
                <h3 className="np-rubrics-group flex items-center gap-2 px-3 pb-2 text-[0.625rem] font-semibold tracking-[0.14em] text-muted uppercase">{group.label}</h3>
              ) : groupIndex > 0 ? (
                <div className="mx-auto my-2.5 h-px w-5 bg-line" aria-hidden="true" />
              ) : null}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <RubricRow item={item} current={current} compact={!expanded} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </aside>

      <Sheet open={sheetOpen} onClose={closeSheet} label="Рубрики" side="left">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-[1.375rem] leading-tight font-bold tracking-tight text-ink">Рубрики</h2>
            <p className="mt-1 text-[0.6875rem] font-medium text-muted">Новините по теми</p>
            <span className="np-gradient-bg mt-3 block h-[2px] w-9 rounded-full" aria-hidden="true" />
          </div>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Затвори менюто"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2"
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
