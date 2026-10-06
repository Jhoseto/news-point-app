"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { BrandLogoImg } from "@/components/brand-logo-img";
import { withBase } from "@/lib/paths";

const NAV = [
  { href: "/", label: "Материали", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/articles/new", label: "Нов материал", icon: "M12 5v14M5 12h14" },
  { href: "/polls", label: "Анкети", icon: "M5 20V10M12 20V4M19 20v-7" },
  { href: "/submissions", label: "Сигнали", icon: "M4 5h16v11H8l-4 4V5z" },
  { href: "/my-news", label: "Моята новина", icon: "M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h11l5 4V6a2 2 0 0 0-2-2zM7 9h10M7 13h6" },
  { href: "/arrange", label: "Подреждане", icon: "M12 17v5M8 8a4 4 0 1 1 8 0c0 2-2 3-2 5H10c0-2-2-3-2-5" },
  { href: "/podcasts", label: "Подкасти", icon: "M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" },
  { href: "/stories", label: "Теми с продължение", icon: "M4 7h16M4 12h12M4 17h8" },
];
const USERS_LINK = { href: "/users", label: "Профили", icon: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74" };

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const SITE_ICON = "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5";
const EXIT_ICON = "M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5";
const NAV_STORAGE = "np-studio-nav-collapsed";

function navClass(collapsed: boolean) {
  return [
    "group relative flex items-center rounded-lg text-[13px] font-semibold transition hover:bg-white/6 hover:text-white aria-[current=page]:bg-white/10 aria-[current=page]:text-white",
    collapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-1.5",
  ].join(" ");
}

/** Desktop: dark side menu like WordPress admin. Phone: top bar with the same links. */
export function StudioShell({ user, webUrl, canManageUsers, children }: { user: { name: string; role: string }; webUrl: string; canManageUsers: boolean; children: ReactNode }) {
  const pathname = usePathname().replace(/(.)\/+$/, "$1");
  const nav = NAV;
  const mobileNav = canManageUsers ? [...NAV, USERS_LINK] : NAV;
  // The editor uses the full width for its side-by-side preview.
  const wide = /^\/articles\/[^/]+$/.test(pathname);
  const desk = pathname === "/" || pathname === "/arrange";
  const router = useRouter();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const [collapsed, setCollapsed] = useState(wide);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAV_STORAGE);
      if (saved === "1") setCollapsed(true);
      if (saved === "0") setCollapsed(false);
    } catch {
      /* ignore */
    }
  }, []);

  function toggleNav() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(NAV_STORAGE, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`min-h-dvh transition-[padding] duration-200 ${collapsed ? "lg:pl-[4.25rem]" : "lg:pl-64"}`}>
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-shell text-white/80 transition-[width] duration-200 lg:flex ${collapsed ? "w-[4.25rem]" : "w-64"}`}>
        <div className={`flex h-14 shrink-0 items-center border-b border-line bg-surface ${collapsed ? "justify-center px-1.5" : "gap-2.5 px-3"}`}>
          <BrandLogoImg className={`h-8 w-auto shrink object-contain object-left ${collapsed ? "max-w-[2.4rem]" : "max-w-[8.5rem]"}`} />
          {collapsed ? null : <span className="np-studio-wordmark shrink-0">Studio</span>}
        </div>
        <button
          type="button"
          onClick={toggleNav}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Покажи менюто" : "Прибери менюто"}
          title={collapsed ? "Покажи менюто" : "Прибери менюто"}
          className={`flex h-9 w-full shrink-0 items-center border-b border-white/10 text-[11px] font-semibold text-white/80 transition hover:bg-white/8 hover:text-white ${collapsed ? "justify-center px-1.5" : "gap-1.5 px-3"}`}
        >
          <Icon d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} size={16} />
          {collapsed ? null : "Прибери менюто"}
        </button>
        <nav className={`flex-1 space-y-0.5 ${collapsed ? "p-1.5" : "p-3"}`} aria-label="Studio">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={navClass(collapsed)}
            >
              {isActive(item.href) ? <span className="np-gradient-bg absolute inset-y-1.5 left-0 w-1 rounded-full" aria-hidden="true" /> : null}
              <Icon d={item.icon} />
              {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
            </Link>
          ))}
        </nav>
        <div className={`border-t border-white/10 ${collapsed ? "px-1.5 pt-2 pb-2" : "px-3 pt-3 pb-2.5"}`}>
          {canManageUsers ? (
            <Link
              href={USERS_LINK.href}
              title={USERS_LINK.label}
              aria-label={USERS_LINK.label}
              aria-current={isActive(USERS_LINK.href) ? "page" : undefined}
              className={`${navClass(collapsed)} mb-2 w-full`}
            >
              {isActive(USERS_LINK.href) ? <span className="np-gradient-bg absolute inset-y-1.5 left-0 w-1 rounded-full" aria-hidden="true" /> : null}
              <Icon d={USERS_LINK.icon} />
              {collapsed ? <span className="sr-only">{USERS_LINK.label}</span> : USERS_LINK.label}
            </Link>
          ) : null}
          <Link
            href="/profile"
            title={user.name}
            aria-current={isActive("/profile") ? "page" : undefined}
            className={`group flex w-full min-w-0 items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10 transition hover:bg-white/[0.1] aria-[current=page]:bg-white/[0.12] ${collapsed ? "justify-center p-1.5" : "gap-3 p-2.5"}`}
          >
            <span className={`np-gradient-bg relative flex shrink-0 rounded-full p-[2px] shadow-[0_8px_20px_-10px_rgb(124_155_255/0.9)] ${collapsed ? "size-9" : "size-11"}`}>
              <span className="relative flex size-full items-center justify-center overflow-hidden rounded-full bg-[#12183a]">
                <span className="text-[11px] font-extrabold tracking-wide text-white">{initials}</span>
                <img src={withBase("/api/profile/photo/")} alt="" className="absolute inset-0 size-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              </span>
            </span>
            {collapsed ? null : (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm leading-tight font-bold tracking-tight text-white">{user.name}</span>
                <span className="mt-1.5 inline-flex max-w-full truncate rounded-full bg-white/10 px-2 py-0.5 text-[10px] leading-none font-semibold tracking-wide text-white/80">{user.role}</span>
              </span>
            )}
          </Link>
          <div className={`mt-2 flex ${collapsed ? "flex-col items-center gap-1" : "items-center justify-between gap-2"}`}>
            <a
              href={webUrl}
              target="_blank"
              rel="noreferrer"
              title="Към сайта"
              aria-label="Към сайта"
              className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/8 hover:text-white"
            >
              <Icon d={SITE_ICON} size={13} />
              {collapsed ? null : "Към сайта"}
            </a>
            <button
              type="button"
              onClick={signOut}
              title="Изход"
              aria-label="Изход"
              className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/8 hover:text-white"
            >
              <Icon d={EXIT_ICON} size={13} />
              {collapsed ? null : "Изход"}
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur lg:hidden">
        <BrandLogoImg className="h-7 w-auto max-w-[6.5rem] shrink-0 object-contain" />
        <nav className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Studio">
          {mobileNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className="flex size-9 items-center justify-center rounded-lg text-sm font-bold text-muted aria-[current=page]:bg-surface-2 aria-[current=page]:text-ink sm:size-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5"
            >
              <Icon d={item.icon} />
              <span className="sr-only sm:not-sr-only">{item.label}</span>
            </Link>
          ))}
          <a href={webUrl} target="_blank" rel="noreferrer" aria-label="Към сайта" title="Към сайта" className="flex size-9 items-center justify-center rounded-lg text-muted sm:size-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5">
            <Icon d={SITE_ICON} />
            <span className="sr-only sm:not-sr-only text-sm font-bold">Към сайта</span>
          </a>
          <button type="button" onClick={signOut} aria-label="Изход" title="Изход" className="flex size-9 items-center justify-center rounded-lg text-sm font-bold text-muted sm:size-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5">
            <Icon d={EXIT_ICON} />
            <span className="sr-only sm:not-sr-only">Изход</span>
          </button>
        </nav>
      </header>

      <main className={wide ? "" : desk ? "px-3 py-3 lg:px-4 lg:py-3" : "mx-auto max-w-[1400px] px-3 py-3 sm:px-4 lg:px-5 lg:py-3"}>{children}</main>
    </div>
  );
}
