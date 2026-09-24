"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CategoryRef } from "@/lib/queries";
import { BoltIcon, CloseIcon, GridIcon, HomeIcon, MenuIcon } from "./icons";
import { ThemeChoice } from "./theme";

type NavItem = Pick<CategoryRef, "name" | "path">;

function useActivePath(): string {
  return usePathname() ?? "/";
}

function isActive(current: string, path: string) {
  return path === "/" ? current === "/" : current.startsWith(path);
}

export function DesktopNav({ items }: { items: NavItem[] }) {
  const current = useActivePath();
  const all = [{ name: "Начало", path: "/" }, ...items];
  return (
    <nav aria-label="Основна навигация" className="hidden lg:block">
      <ul className="flex items-center gap-0.5">
        {all.map((item) => {
          const active = isActive(current, item.path);
          return (
            <li key={item.path}>
              <Link
                href={item.path}
                aria-current={active ? "page" : undefined}
                className="relative block rounded-lg px-2.5 py-2 text-[0.8125rem] font-semibold whitespace-nowrap text-muted transition-colors hover:text-ink aria-[current=page]:text-ink xl:px-3 xl:text-sm"
              >
                {item.name}
                {active ? (
                  <span className="np-gradient-bg absolute inset-x-2.5 -bottom-[1px] h-[3px] rounded-full xl:inset-x-3" aria-hidden="true" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const current = useActivePath();

  useEffect(() => setOpen(false), [current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Меню"
        aria-expanded={open}
        aria-controls="np-mobile-menu"
        className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-surface-2 lg:hidden"
        data-menu-trigger
      >
        <MenuIcon width={22} height={22} />
      </button>
      {/* Portal: the header's backdrop-filter would otherwise contain this fixed layer. */}
      {open ? createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" id="np-mobile-menu" role="dialog" aria-modal="true" aria-label="Меню">
          <button type="button" className="absolute inset-0 bg-[#000516]/50 backdrop-blur-sm" aria-label="Затвори менюто" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(22rem,88vw)] flex-col gap-6 overflow-y-auto border-l border-line bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold tracking-wide text-muted uppercase">Рубрики</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Затвори"
                className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-surface-2"
                autoFocus
              >
                <CloseIcon width={22} height={22} />
              </button>
            </div>
            <nav aria-label="Рубрики">
              <ul className="flex flex-col gap-1">
                {[{ name: "Начало", path: "/" }, ...items].map((item) => (
                  <li key={item.path}>
                    <Link
                      href={item.path}
                      aria-current={isActive(current, item.path) ? "page" : undefined}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold text-ink hover:bg-surface-2 aria-[current=page]:bg-surface-2 aria-[current=page]:text-accent dark:aria-[current=page]:text-link"
                    >
                      <span className="np-ring !size-3.5" aria-hidden="true" />
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-auto flex flex-col gap-2">
              <span className="text-sm font-bold tracking-wide text-muted uppercase">Режим</span>
              <ThemeChoice />
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export function BottomNav() {
  const current = useActivePath();
  const openMenu = () => document.querySelector<HTMLButtonElement>("[data-menu-trigger]")?.click();
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
        <button type="button" onClick={openMenu} className={itemClass}>
          <GridIcon width={21} height={21} />
          Рубрики
        </button>
      </div>
    </nav>
  );
}
