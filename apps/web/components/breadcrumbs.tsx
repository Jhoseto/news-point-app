import Link from "next/link";
import { ChevronRightIcon, HomeIcon } from "./icons";

export function Breadcrumbs({ items }: { items: { name: string; path?: string }[] }) {
  return (
    <nav aria-label="Навигационна пътека" className="text-xs font-medium text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link href="/" className="inline-flex min-h-11 items-center gap-1 hover:text-ink">
            <HomeIcon width={14} height={14} />
            Начало
          </Link>
        </li>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.name}-${index}`} className="inline-flex min-w-0 items-center gap-1">
              <ChevronRightIcon width={13} height={13} className="shrink-0" />
              {item.path && !last ? (
                <Link href={item.path} className="inline-flex min-h-11 min-w-11 items-center px-1 hover:text-ink">
                  {item.name}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="line-clamp-1 text-body">
                  {item.name}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
