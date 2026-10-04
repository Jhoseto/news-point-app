import "@fontsource-variable/literata/wght.css";
import "@fontsource-variable/literata/wght-italic.css";
import Link from "next/link";
import { LivePointStrip } from "@/components/livepoint/livepoint-strip";
import { getMenuCategories } from "@/lib/queries";
import { HeaderClock } from "./header-clock";
import { BrandLogoImg } from "./brand-logo-img";
import { Logo } from "./logo";
import { BottomNav, MobileSearch, RubricsButton, RubricsNav } from "./nav";
import { SiteSearch } from "./site-search";
import { ThemeToggle } from "./theme";
import { SettingsModal } from "./settings-modal";

/**
 * Desktop bar: search in the exact centre of the viewport (equal 1fr side columns).
 * The logo sits in an overlay aligned to the expanded rubrics column (--np-rail-w-logo), not in the grid.
 * The LivePoint utility line is the second row (DEC-119).
 */
export function SiteHeader() {
  return (
    <header data-np-header className="sticky top-0 z-40 border-b border-line bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="np-masthead relative flex h-[3.25rem] items-center gap-1 border-b border-line px-2 sm:px-4 lg:grid lg:h-[4.75rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] lg:gap-6 lg:px-0 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,40rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-1 lg:hidden">
          <RubricsButton />
          <Logo variant="header" />
        </div>

        <div className="hidden min-w-0 lg:block" aria-hidden="true" />

        <div className="hidden min-w-0 lg:block">
          <SiteSearch />
        </div>

        <div className="ml-auto flex items-center justify-end gap-1 pr-0 sm:gap-2 sm:pr-4 lg:ml-0 lg:min-w-0 lg:pr-8 xl:gap-5 3xl:pr-12">
          <div className="hidden lg:block">
            <HeaderClock />
          </div>
          <MobileSearch />
          <span className="hidden h-8 w-px bg-line lg:block" aria-hidden="true" />
          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
            <SettingsModal />
          </div>
        </div>

        <div className="np-masthead-rail-logo pointer-events-none absolute inset-y-0 left-0 z-10 hidden items-center justify-center lg:flex lg:w-[var(--np-rail-w-logo)]">
          <div className="pointer-events-auto flex max-w-full justify-center px-1">
            <Logo variant="header" />
          </div>
        </div>
      </div>
      <LivePointStrip />
    </header>
  );
}

/** Page frame below the header: rubrics rail on desktop, then content and footer. */
export async function SiteBody({ children }: { children: React.ReactNode }) {
  const menu = await getMenuCategories();
  return (
    <div className="lg:flex">
      <RubricsNav items={menu.map(({ slug, name, path }) => ({ slug, name, path }))} />
      <div className="min-w-0 flex-1">
        <main id="main">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}

/** Aerial panorama above the whole city. Rangel Koldanov, CC BY 4.0. */
const PLOVDIV_VIEW = "/brand/plovdiv-aerial.webp";

/** Brand strip for the gap beside the sidebar: real Plovdiv photo under the blue, line skyline in front. */
export function PlovdivBanner() {
  return (
    <section aria-label="NewsPoint.bg" className="relative isolate mt-auto hidden min-h-36 flex-1 overflow-hidden rounded-3xl shadow-card lg:block">
      <img src={PLOVDIV_VIEW} alt="Пловдив от въздуха" className="absolute inset-x-0 top-1/2 h-auto w-full -translate-y-1/2" />
      <div className="absolute inset-0 bg-[#0c4fbe]/55" aria-hidden="true" />
      <svg viewBox="0 0 720 160" preserveAspectRatio="xMaxYMax meet" className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] w-full text-white" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" opacity="0.95">
          <path d="M40 128c36-4 48-22 78-26 26-4 34 14 62 10 24-3 30-24 54-28 22-4 28 16 52 12 30-5 36-34 66-30 22 3 28 18 50 14 26-4 34-26 60-22 24 4 36 20 58 12 18-6 40 2 70-16" />
          <path d="M250 124c22-18 40-46 62-50 16-3 20 12 36 10 18-2 22-20 40-24" />
          <path d="M470 118c28-22 46-58 74-64 20-4 24 10 42 8 22-3 30-28 52-24 16 3 28 16 48 8" />
          <path d="M560 108 V58 l8-16 8 16 v50 M568 42 v-10 M564 36 h8" />
          <path d="M548 112 v-14 h6 v14 M590 112 V86 h8 v26 M602 112 V78 h14 v34 M620 112 V92 h8 v20 M632 112 V84 h12 v28" />
          <path d="M430 120 v-18 h7 v18 M442 120 v-26 h11 v26 M456 120 v-12 h6 v12" />
        </g>
      </svg>
      <div className="pointer-events-none absolute -top-10 -right-6 size-36 rounded-full bg-[#7c3aed]/80" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-8 -bottom-12 size-40 rounded-full bg-[#c026d3]/70" aria-hidden="true" />
      <div className="relative flex h-full items-center gap-6 px-7 xl:gap-8 xl:px-9">
        <BrandLogoImg className="h-14 w-auto max-w-[min(100%,18rem)] shrink-0 object-contain np-brand-logo" sizes="280px" />
        <div className="flex min-w-0 flex-1 items-center gap-5 xl:gap-6">
          <div className="h-14 w-px shrink-0 bg-white/45" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 items-center text-white" style={{ textShadow: "0 1px 2px rgb(8 28 90 / 0.35)" }}>
            <div className="inline-flex max-w-full flex-col items-stretch">
              <p className="text-lg leading-snug font-medium tracking-tight xl:text-xl" style={{ fontFamily: '"Literata Variable", Georgia, serif' }}>
                Отвъд заглавията и по-близо до фактите.
              </p>
              <p className="mt-2.5 flex w-full items-center gap-2 text-xs font-light tracking-wide text-white/90 xl:text-sm">
                <span className="whitespace-nowrap">Питаме</span>
                <span className="h-px min-w-2 flex-1 bg-white/50" aria-hidden="true" />
                <span className="whitespace-nowrap">Проверяваме</span>
                <span className="h-px min-w-2 flex-1 bg-white/50" aria-hidden="true" />
                <span className="whitespace-nowrap">Информираме</span>
              </p>
            </div>
          </div>
        </div>
      </div>
      <p
        className="absolute bottom-7 left-8 z-10 text-lg leading-none font-medium tracking-tight text-white italic xl:bottom-8 xl:left-10 xl:text-xl"
        style={{ fontFamily: '"Literata Variable", Georgia, serif', textShadow: "0 1px 2px rgb(8 28 90 / 0.45)" }}
      >
        Защото истината има значение!
      </p>
    </section>
  );
}

export function BrandBanner() {
  return (
    <section
      aria-label="NewsPoint.bg"
      className="relative isolate overflow-hidden rounded-3xl border border-line bg-surface px-6 py-8 shadow-card sm:px-10"
    >
      <div
        className="absolute -top-24 -right-16 -z-10 size-72 rounded-full opacity-25 blur-3xl np-gradient-bg dark:opacity-40"
        aria-hidden="true"
      />
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
        <Logo className="h-12 sm:h-14" />
        <p className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Защото истината <span className="np-gradient-text">има значение.</span>
        </p>
      </div>
    </section>
  );
}

export async function SiteFooter() {
  const menu = await getMenuCategories();
  return (
    <footer className="mt-16 border-t border-line bg-surface pb-20 lg:pb-0">
      <div className="np-container grid gap-8 py-10 md:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-3">
          <Logo className="h-10" />
          <p className="max-w-xs text-sm text-muted">Новини от Пловдив, България и света.</p>
          <Link href="/settings/" prefetch={false} className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-accent hover:underline dark:text-link">Настройки на четене</Link>
          <Link href="/team/" prefetch={false} className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold text-accent hover:underline dark:text-link">Екип</Link>
        </div>
        <nav aria-label="Рубрики във футъра">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {menu.map((category) => (
              <li key={category.id}>
                <Link href={category.path} className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold text-body hover:text-accent dark:hover:text-link">
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="np-container py-4 text-xs text-muted">© {new Date().getFullYear()} NewsPoint.bg · Локален преглед на NewsPoint 2.0</p>
      </div>
    </footer>
  );
}

export { BottomNav };
