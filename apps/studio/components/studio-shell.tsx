"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { BrandLogoImg } from "@/components/brand-logo-img";
import { withBase } from "@/lib/paths";
import { studioSessionEnded } from "@/lib/session-probe";
import { MONITORING_SEEN_EVENT, needsMonitoringAttention, seenKey, useMonitoring, type MonitoringSummary } from "@/lib/error-monitoring-client";

// A separate editor document lets beforeunload protect Back/Forward and tab closing.
function StudioNavLink({ href, ...props }: Pick<ComponentProps<"a">, "children" | "className" | "title" | "aria-label" | "aria-current"> & { href: string; "data-help"?: string | undefined }) {
  return href.startsWith("/articles/") ? <a href={withBase(href)} {...props} /> : <Link href={href} {...props} />;
}

const NAV = [
  { href: "/arrange", label: "Уеб управление", icon: "M12 17v5M8 8a4 4 0 1 1 8 0c0 2-2 3-2 5H10c0-2-2-3-2-5" },
  { href: "/", label: "Материали", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/articles/new", label: "Нов материал", icon: "M12 5v14M5 12h14" },
  { href: "/polls", label: "Анкети", icon: "M5 20V10M12 20V4M19 20v-7" },
  { href: "/submissions", label: "Сигнали", icon: "M4 5h16v11H8l-4 4V5z" },
  { href: "/my-news", label: "Моята новина", icon: "M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h11l5 4V6a2 2 0 0 0-2-2zM7 9h10M7 13h6" },
  { href: "/podcasts", label: "Подкасти", icon: "M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" },
  { href: "/stories", label: "Теми с продължение", icon: "M4 7h16M4 12h12M4 17h8" },
  { href: "/moyat-plovdiv", label: "Моят Пловдив", icon: "M3 21h18M5 21V9l7-6 7 6v12M9 21v-7h6v7" },
];
const USERS_LINK = { href: "/users", label: "Профили", icon: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74" };
const LOGS_LINK = { href: "/logs", label: "Logs", icon: "M8 5h12M8 12h12M8 19h12M3 5h.01M3 12h.01M3 19h.01" };
const MONITORING_LINK = { href: "/error-monitoring", label: "Error monitoring", icon: "M3 12h4l3-8 4 16 3-8h4" };

const NAV_HELP: Record<string, string> = {
  "/moyat-plovdiv": "Градските справки, източниците, обновяването и видимостта им за читателите.",
  "/arrange": "Подрежда новините по местата в сайта и управлява извънредната лента.",
  "/": "Списък с материали. Търсете, филтрирайте и отваряйте новини за редакция.",
  "/articles/new": "Отваря нова чернова за написване на новина.",
  "/polls": "Създава анкети и управлява въпросите, гласуването и резултатите.",
  "/submissions": "Получени читателски сигнали и техният редакционен статус.",
  "/my-news": "Материали, изпратени от читатели. Проверете ги и ги свържете със статия.",
  "/podcasts": "Качване и публикуване на епизоди и работа по AI сценарии и аудио.",
  "/stories": "Обединява свързани статии в тема с продължение и хронология.",
  "/users": "Управлява служебни профили и права за достъп до Studio.",
  "/logs": "История на действията в Studio: служител, промяна, час и резултат.",
  "/error-monitoring": "Работа на сайта, засечени прекъсвания и диагностика. Удивителната показва активен проблем или нов сигнал и се изчиства при преглед след възстановяване.",
  "/settings/social/": "Свързва Facebook страница и показва проблеми при изпращане на новини.",
};

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
export function StudioShell({ user, webUrl, canManageUsers, canManageSocial = false, children }: { user: { id?: string; name: string; role: string }; webUrl: string; canManageUsers: boolean; canManageSocial?: boolean; children: ReactNode }) {
  const pathname = usePathname().replace(/(.)\/+$/, "$1");
  const nav = NAV;
  const mobileNav = [...(canManageUsers ? [...NAV, USERS_LINK, LOGS_LINK] : NAV), ...(canManageSocial ? [{ href: "/settings/social/", label: "Facebook", icon: "M14 4h-2a3 3 0 0 0-3 3v13M6 11h9" }] : [])];
  // The editor uses the full width for its side-by-side preview.
  const wide = /^\/articles\/[^/]+$/.test(pathname);
  const desk = pathname === "/" || pathname === "/arrange" || pathname === "/logs" || pathname === "/moyat-plovdiv" || pathname === "/error-monitoring";
  const router = useRouter();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const [collapsed, setCollapsed] = useState(wide);
  const [sessionEnded, setSessionEnded] = useState(false);
  const signingOut = useRef(false);
  const monitoring = useMonitoring<MonitoringSummary>(true, canManageUsers);
  const [monitoringSeen, setMonitoringSeen] = useState<string | null>(null);
  const monitoringKey = seenKey(user.id ?? user.name);
  const monitoringAttention = needsMonitoringAttention(monitoring.data, monitoringSeen, monitoring.failed);
  useEffect(() => {
    const read = () => { try { setMonitoringSeen(localStorage.getItem(monitoringKey)); } catch {} };
    const acknowledged = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; at: string }>).detail;
      if (detail?.key === monitoringKey && Number.isFinite(Date.parse(detail.at))) setMonitoringSeen(previous => previous && previous > detail.at ? previous : detail.at);
    };
    read(); window.addEventListener("storage", read); window.addEventListener(MONITORING_SEEN_EVENT, acknowledged);
    return () => { window.removeEventListener("storage", read); window.removeEventListener(MONITORING_SEEN_EVENT, acknowledged); };
  }, [monitoringKey]);
  const monitoringTitle = !monitoring.failed && monitoring.data?.activeProblem ? "Има активен проблем за проверка" : "Има непрегледан диагностичен сигнал";
  const monitoringBadge = monitoringAttention ? <span title={monitoringTitle} className={`absolute right-0 top-0 flex size-4 items-center justify-center rounded-full text-[11px] font-black text-white ${!monitoring.failed && monitoring.data?.activeProblem ? "bg-red-600" : "bg-amber-600"}`}><span aria-hidden="true">!</span><span className="sr-only">{monitoringTitle}</span></span> : null;

  useEffect(() => {
    let active = true;
    let checking = false;
    let ended = false;
    const loginUrl = withBase("/login/?session=changed");
    const checkSession = async () => {
      if (!active || checking || ended || signingOut.current || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const revoked = await studioSessionEnded();
        if (active && !signingOut.current && revoked) {
          ended = true;
          setSessionEnded(true);
          // The editor's beforeunload warning still protects unsaved text.
          window.location.replace(loginUrl);
        }
      } finally {
        checking = false;
      }
    };
    void checkSession();
    const timer = window.setInterval(() => void checkSession(), 15_000);
    const onFocus = () => void checkSession();
    const onVisibility = () => { if (document.visibilityState === "visible") void checkSession(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

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
    signingOut.current = true;
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
      {sessionEnded ? <div role="alert" className="fixed inset-x-3 top-3 z-50 rounded-xl border border-warning/40 bg-surface px-4 py-3 text-sm font-semibold text-ink shadow-xl sm:left-auto sm:max-w-md">
        Сесията приключи или профилът е отворен от друго място. Ако останахте тук заради незаписан текст, копирайте го; записването вече не е възможно. <button type="button" className="ml-1 text-link underline" onClick={() => window.location.replace(withBase("/login/?session=changed"))}>Влезте отново</button>
      </div> : null}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-shell text-white/80 transition-[width] duration-200 lg:flex ${collapsed ? "w-[4.25rem]" : "w-64"}`}>
        <div className={`flex h-14 shrink-0 items-center border-b border-line bg-surface ${collapsed ? "justify-center px-1.5" : "gap-2.5 px-3"}`}>
          <BrandLogoImg
            className={`h-7 w-auto shrink-0 object-contain object-left ${collapsed ? "max-w-[2.25rem] overflow-hidden" : "max-w-[10.5rem]"}`}
            sizes={collapsed ? "36px" : "168px"}
          />
          {collapsed ? null : <span className="np-studio-wordmark shrink-0">Studio</span>}
        </div>
        <button
          type="button"
          onClick={toggleNav}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Покажи менюто" : "Прибери менюто"}
          data-help="Прибира или разгъва страничното меню. Страницата остава отворена."
          className={`flex h-9 w-full shrink-0 items-center border-b border-white/10 text-[11px] font-semibold text-white/80 transition hover:bg-white/8 hover:text-white ${collapsed ? "justify-center px-1.5" : "gap-1.5 px-3"}`}
        >
          <Icon d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} size={16} />
          {collapsed ? null : "Прибери менюто"}
        </button>
        <nav className={`flex-1 space-y-0.5 ${collapsed ? "p-1.5" : "p-3"}`} aria-label="Studio">
          {nav.map((item) => (
            <StudioNavLink
              key={item.href}
              href={item.href}
              data-help={NAV_HELP[item.href]}
              aria-label={item.label}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={navClass(collapsed)}
            >
              {isActive(item.href) ? <span className="np-gradient-bg absolute inset-y-1.5 left-0 w-1 rounded-full" aria-hidden="true" /> : null}
              <Icon d={item.icon} />
              {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
            </StudioNavLink>
          ))}
        </nav>
        <div className={`border-t border-white/10 ${collapsed ? "px-1.5 pt-2 pb-2" : "px-3 pt-3 pb-2.5"}`}>
          {canManageSocial && <Link href="/settings/social/" data-help={NAV_HELP["/settings/social/"]} className={`${navClass(collapsed)} mb-1`}><span aria-hidden="true">f</span>{!collapsed && "Facebook"}</Link>}
          {canManageUsers ? (
            <>
              <Link
                href={USERS_LINK.href}
                data-help={NAV_HELP[USERS_LINK.href]}
                aria-label={USERS_LINK.label}
                aria-current={isActive(USERS_LINK.href) ? "page" : undefined}
                className={`${navClass(collapsed)} mb-0.5 w-full`}
              >
                {isActive(USERS_LINK.href) ? <span className="np-gradient-bg absolute inset-y-1.5 left-0 w-1 rounded-full" aria-hidden="true" /> : null}
                <Icon d={USERS_LINK.icon} />
                {collapsed ? <span className="sr-only">{USERS_LINK.label}</span> : USERS_LINK.label}
              </Link>
              <Link
                href={LOGS_LINK.href}
                data-help={NAV_HELP[LOGS_LINK.href]}
                aria-label={LOGS_LINK.label}
                aria-current={isActive(LOGS_LINK.href) ? "page" : undefined}
                className={`${navClass(collapsed)} mb-2 w-full`}
              >
                {isActive(LOGS_LINK.href) ? <span className="np-gradient-bg absolute inset-y-1.5 left-0 w-1 rounded-full" aria-hidden="true" /> : null}
                <Icon d={LOGS_LINK.icon} />
                {collapsed ? <span className="sr-only">{LOGS_LINK.label}</span> : LOGS_LINK.label}
              </Link>
              <Link href={MONITORING_LINK.href} data-help={NAV_HELP[MONITORING_LINK.href]} aria-label={`${MONITORING_LINK.label}${monitoringAttention ? ` — ${monitoringTitle}` : ""}`} aria-current={isActive(MONITORING_LINK.href) ? "page" : undefined} className={`${navClass(collapsed)} mb-2 w-full`}>
                <Icon d={MONITORING_LINK.icon} />{collapsed ? <span className="sr-only">{MONITORING_LINK.label}</span> : MONITORING_LINK.label}{monitoringBadge}
              </Link>
            </>
          ) : null}
          <Link
            href="/profile"
            data-help="Вашето име, профилна снимка, вътрешна информация и смяна на паролата."
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
              data-help="Отваря публичния сайт в нов раздел."
              aria-label="Към сайта"
              className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/8 hover:text-white"
            >
              <Icon d={SITE_ICON} size={13} />
              {collapsed ? null : "Към сайта"}
            </a>
            <button
              type="button"
              onClick={signOut}
              data-help="Прекратява текущата сесия в Studio."
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
        <BrandLogoImg className="h-7 w-auto max-w-[9rem] shrink-0 object-contain object-left" sizes="144px" />
        {canManageUsers ? <StudioNavLink href={MONITORING_LINK.href} aria-label={`${MONITORING_LINK.label}${monitoringAttention ? ` — ${monitoringTitle}` : ""}`} aria-current={isActive(MONITORING_LINK.href) ? "page" : undefined} data-help={NAV_HELP[MONITORING_LINK.href]} className="relative flex size-9 shrink-0 items-center justify-center rounded-lg text-muted aria-[current=page]:bg-surface-2 aria-[current=page]:text-ink"><Icon d={MONITORING_LINK.icon} />{monitoringBadge}</StudioNavLink> : null}
        <nav className="relative ml-auto flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Studio">
          {mobileNav.map((item) => (
            <StudioNavLink
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              aria-label={item.label}
              data-help={NAV_HELP[item.href]}
              className="relative flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-muted aria-[current=page]:bg-surface-2 aria-[current=page]:text-ink sm:size-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5"
            >
              <Icon d={item.icon} />
              <span className="sr-only sm:not-sr-only">{item.label}</span>
            </StudioNavLink>
          ))}
          <a href={webUrl} target="_blank" rel="noreferrer" aria-label="Към сайта" data-help="Отваря публичния сайт в нов раздел." className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted sm:size-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5">
            <Icon d={SITE_ICON} />
            <span className="sr-only sm:not-sr-only text-sm font-bold">Към сайта</span>
          </a>
          <button type="button" onClick={signOut} aria-label="Изход" data-help="Прекратява текущата сесия в Studio." className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-muted sm:size-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5">
            <Icon d={EXIT_ICON} />
            <span className="sr-only sm:not-sr-only">Изход</span>
          </button>
        </nav>
      </header>

      <main className={wide ? "" : desk ? "px-3 py-3 lg:px-4 lg:py-3" : "mx-auto max-w-[1400px] px-3 py-3 sm:px-4 lg:px-5 lg:py-3"}>{children}</main>
    </div>
  );
}
