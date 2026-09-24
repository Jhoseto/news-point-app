import Link from "next/link";
import { LivePointStrip } from "@/components/livepoint/livepoint-strip";
import { getMenuCategories } from "@/lib/queries";
import { HeaderClock } from "./header-clock";
import { Logo } from "./logo";
import { BottomNav, MobileSearch, RubricsButton, RubricsNav } from "./nav";
import { SiteSearch } from "./site-search";
import { ThemeToggle } from "./theme";

/**
 * Desktop bar: logo on the left, search in the exact centre of the viewport
 * (equal side columns), date/time and the theme switch on the right.
 * The LivePoint utility line is the second row (DEC-119).
 */
export function SiteHeader() {
  return (
    <header data-np-header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="np-masthead flex h-16 items-center gap-1 px-2 sm:px-4 lg:grid lg:h-[4.75rem] lg:grid-cols-[minmax(0,1fr)_minmax(20rem,40rem)_minmax(0,1fr)] lg:gap-6 lg:px-8 3xl:px-12">
        <div className="flex min-w-0 items-center gap-1">
          <RubricsButton />
          <Logo className="h-9 sm:h-10 lg:h-12 3xl:h-[3.25rem]" />
        </div>
        <div className="hidden lg:block">
          <SiteSearch />
        </div>
        <div className="ml-auto flex items-center justify-end gap-1 sm:gap-2 lg:gap-5">
          <div className="hidden lg:block">
            <HeaderClock />
          </div>
          <MobileSearch />
          <span className="hidden h-8 w-px bg-line lg:block" aria-hidden="true" />
          <ThemeToggle />
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
      <div className="relative flex h-full items-center gap-8 px-8 py-6">
        <img src="/brand/newspoint-logo-dark.webp" alt="NewsPoint.bg" width={1261} height={343} className="h-14 w-auto shrink-0" />
        <p className="max-w-xs text-2xl leading-tight font-extrabold tracking-tight text-white">
          Защото истината има значение!
        </p>
        <span className="absolute right-4 bottom-2 text-[0.625rem] text-white/70"></span>
      </div>
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
        </div>
        <nav aria-label="Рубрики във футъра">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {menu.map((category) => (
              <li key={category.id}>
                <Link href={category.path} className="text-sm font-semibold text-body hover:text-accent dark:hover:text-link">
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
