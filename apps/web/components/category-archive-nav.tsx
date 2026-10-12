import type { ReactNode } from "react";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { CategoryArchivePageLink } from "./category-archive-pagination";
import type { CategoryPageStripItem } from "@/lib/category-pagination";

function JumpLink({
  href,
  label,
  disabled,
  children,
}: {
  href: string | null;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  if (disabled || !href) {
    return (
      <span className="np-category-pagination-jump is-disabled" aria-hidden="true">
        {children}
      </span>
    );
  }
  return (
    <CategoryArchivePageLink href={href} prefetch={false} className="np-category-pagination-jump" aria-label={label}>
      {children}
    </CategoryArchivePageLink>
  );
}

export function CategoryArchiveNav({
  categoryName,
  strip,
  currentPage,
  totalPages,
  firstHref,
  lastHref,
  previous,
  next,
}: {
  categoryName: string;
  strip: CategoryPageStripItem[];
  currentPage: number;
  totalPages: number;
  firstHref: string;
  lastHref: string | null;
  previous: string | null;
  next: string | null;
}) {
  if (totalPages <= 1 && !previous && !next) return null;

  const onFirst = currentPage <= 1;
  const onLast = currentPage >= totalPages;

  return (
    <nav
      aria-label={`Страници на рубрика ${categoryName}`}
      className="flex flex-col gap-4 border-t border-line pt-5"
    >
      <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-3">
        <div className="flex justify-center lg:justify-start">
          {previous ? (
            <CategoryArchivePageLink
              href={previous}
              prefetch={false}
              rel="prev"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-surface-2"
            >
              <ArrowRightIcon className="rotate-180" /> Назад
            </CategoryArchivePageLink>
          ) : (
            <span className="hidden min-h-11 lg:block" aria-hidden="true" />
          )}
        </div>

        <div className="flex min-w-0 flex-col items-center gap-2">
          <p className="text-sm font-semibold text-muted">
            Страница{" "}
            <span className="font-bold text-ink">{currentPage}</span> от{" "}
            <span className="font-bold text-ink">{totalPages}</span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1">
            <JumpLink href={onFirst ? null : firstHref} label="Първа страница" disabled={onFirst}>
              <ChevronLeftIcon width={16} height={16} strokeWidth={2.5} />
              <ChevronLeftIcon width={16} height={16} strokeWidth={2.5} className="-ms-2.5" aria-hidden="true" />
            </JumpLink>
            <JumpLink href={previous} label="Предишна страница" disabled={!previous}>
              <ChevronLeftIcon width={17} height={17} strokeWidth={2.5} />
            </JumpLink>

            <ol className="np-category-pagination mx-0.5 flex flex-wrap items-center justify-center gap-1">
              {strip.map((item, index) =>
                item.kind === "ellipsis" ? (
                  <li key={`gap-${index}`} className="np-category-pagination-gap px-1 text-sm font-bold text-muted" aria-hidden="true">
                    …
                  </li>
                ) : item.kind === "current" ? (
                  <li key={`page-${item.page}`}>
                    <span className="np-category-pagination-current" aria-current="page">
                      {item.page}
                    </span>
                  </li>
                ) : (
                  <li key={`page-${item.page}`}>
                    <CategoryArchivePageLink href={item.href} prefetch={false} className="np-category-pagination-link">
                      {item.page}
                    </CategoryArchivePageLink>
                  </li>
                ),
              )}
            </ol>

            <JumpLink href={next} label="Следваща страница" disabled={!next}>
              <ChevronRightIcon width={17} height={17} strokeWidth={2.5} />
            </JumpLink>
            <JumpLink href={onLast ? null : lastHref} label="Последна страница" disabled={onLast || !lastHref}>
              <ChevronRightIcon width={16} height={16} strokeWidth={2.5} />
              <ChevronRightIcon width={16} height={16} strokeWidth={2.5} className="-ms-2.5" aria-hidden="true" />
            </JumpLink>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          {next ? (
            <CategoryArchivePageLink
              href={next}
              prefetch={false}
              rel="next"
              className="np-gradient-bg inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-on-accent shadow-card transition hover:brightness-110"
            >
              Още новини <ArrowRightIcon />
            </CategoryArchivePageLink>
          ) : (
            <span className="text-center text-sm text-muted lg:text-right">Стигнахте края на наличния архив</span>
          )}
        </div>
      </div>
    </nav>
  );
}
