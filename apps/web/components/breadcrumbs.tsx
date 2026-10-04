import Link from "next/link";
import { ChevronRightIcon, HomeIcon } from "./icons";

export function Breadcrumbs({ items, dense = false }: { items: { name: string; path?: string }[]; dense?: boolean }) {
  const touch = dense ? "min-h-8" : "min-h-11";
  return (
    <nav aria-label="Навигационна пътека" className={`font-medium text-muted ${dense ? "text-[0.6875rem]" : "text-xs"}`}>
      <ol className="flex flex-wrap items-center gap-0.5">
        <li>
          <Link href="/" className={`inline-flex ${touch} items-center gap-1 hover:text-ink`}>
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
                <Link href={item.path} className={`inline-flex ${touch} ${dense ? "min-w-0 px-0.5" : "min-w-11 px-1"} items-center hover:text-ink`}>
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
