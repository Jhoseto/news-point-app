import Link from "next/link";
import { getLatest, getMenuCategories } from "@/lib/queries";
import { formatTime, formatToday } from "@/lib/format";
import { Logo } from "./logo";
import { BottomNav, DesktopNav, MobileMenu } from "./nav";
import { ThemeToggle } from "./theme";

export async function SiteHeader() {
  const [menu, [latest]] = await Promise.all([getMenuCategories(), getLatest(1)]);
  const items = menu.map(({ name, path }) => ({ name, path }));
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-4 sm:px-6">
        <Logo className="h-9 lg:h-10" />
        <div className="flex-1" />
        <span className="hidden text-xs font-medium text-muted md:block">{formatToday()}</span>
        <ThemeToggle />
        <MobileMenu items={items} />
      </div>
      <div className="hidden border-t border-line lg:block">
        <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
          <DesktopNav items={items} />
        </div>
      </div>
      {latest ? (
        <div className="border-t border-line">
          <div className="mx-auto flex h-10 max-w-[1320px] items-center gap-3 px-4 text-sm sm:px-6">
            <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-[0.6875rem] font-bold tracking-wide text-on-accent uppercase">
              Последно
            </span>
            <Link href={latest.path} className="min-w-0 truncate font-semibold text-ink hover:text-accent dark:hover:text-link">
              {latest.title}
            </Link>
            <span className="shrink-0 text-xs font-semibold text-muted tabular-nums">{formatTime(latest.publishedAt)}</span>
          </div>
        </div>
      ) : null}
    </header>
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
      <div className="mx-auto grid max-w-[1320px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_2fr]">
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
        <p className="mx-auto max-w-[1320px] px-4 py-4 text-xs text-muted sm:px-6">
          © {new Date().getFullYear()} NewsPoint.bg · Локален преглед на NewsPoint 2.0
        </p>
      </div>
    </footer>
  );
}

export { BottomNav };
