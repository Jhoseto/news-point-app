"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { BrandLogoImg } from "@/components/brand-logo-img";

const NAV = [
  { href: "/", label: "Материали", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/articles/new", label: "Нов материал", icon: "M12 5v14M5 12h14" },
  { href: "/polls", label: "Анкети", icon: "M5 20V10M12 20V4M19 20v-7" },
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

/** Desktop: dark side menu like WordPress admin. Phone: top bar with the same links. */
export function StudioShell({ user, webUrl, canManageUsers, children }: { user: { name: string; role: string }; webUrl: string; canManageUsers: boolean; children: ReactNode }) {
  const pathname = usePathname().replace(/(.)\/+$/, "$1");
  const nav = canManageUsers ? [...NAV, USERS_LINK] : NAV;
  // The editor uses the full width for its side-by-side preview.
  const wide = /^\/articles\/[^/]+$/.test(pathname);
  const router = useRouter();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

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
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-shell text-white/80 lg:flex">
        <div className="flex h-[4.5rem] shrink-0 items-center gap-2.5 border-b border-line bg-surface px-4">
          <BrandLogoImg className="h-9 w-auto max-w-[8.5rem] shrink object-contain object-left" />
          <span className="np-studio-wordmark shrink-0">Studio</span>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Studio">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className="group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition hover:bg-white/6 hover:text-white aria-[current=page]:bg-white/10 aria-[current=page]:text-white"
            >
              {isActive(item.href) ? <span className="np-gradient-bg absolute inset-y-2 left-0 w-1 rounded-full" aria-hidden="true" /> : null}
              <Icon d={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/8 p-2">
          <Link
            href="/profile"
            aria-current={isActive("/profile") ? "page" : undefined}
            className="flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/6 aria-[current=page]:bg-white/8"
          >
            <span className="np-gradient-bg flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white">{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-tight font-bold text-white">{user.name}</span>
              <span className="mt-0.5 block text-[11px] leading-tight text-white/55">{user.role}</span>
            </span>
          </Link>
          <div className="mt-0.5 flex items-center gap-0.5 px-1 pb-0.5">
            <a
              href={webUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-white/70 transition hover:bg-white/8 hover:text-white"
            >
              <Icon d={SITE_ICON} size={13} />
              Към сайта
            </a>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-white/70 transition hover:bg-white/8 hover:text-white"
            >
              <Icon d={EXIT_ICON} size={13} />
              Изход
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur lg:hidden">
        <BrandLogoImg className="h-7 w-auto max-w-[7rem] object-contain" />
        <nav className="ml-auto flex items-center gap-1" aria-label="Studio">
          {nav.map((item) => (
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

      <main className={wide ? "" : "mx-auto max-w-[1400px] px-3 py-3 sm:px-4 lg:px-5 lg:py-3"}>{children}</main>
    </div>
  );
}
