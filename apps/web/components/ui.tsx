import Link from "next/link";
import type { ReactNode } from "react";
import type { CategoryRef, Media } from "@/lib/queries";
import { formatShort, isoDate } from "@/lib/format";
import { ArrowRightIcon, ClockIcon } from "./icons";

export function CategoryPill({ category, glass = true, className = "" }: { category: CategoryRef; glass?: boolean; className?: string }) {
  const look = glass
    ? "border border-white/45 bg-white/15 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.45)] backdrop-blur-md"
    : "bg-accent text-on-accent";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.6875rem] font-bold tracking-wide uppercase ${look} ${className}`}>
      {category.name}
    </span>
  );
}

/** Small category label with a gradient dot, used on cards. */
export function CategoryLabel({ category }: { category: CategoryRef }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-wide text-accent uppercase dark:text-link">
      <span className="np-gradient-bg size-1.5 rounded-full" aria-hidden="true" />
      {category.name}
    </span>
  );
}

export function SectionTitle({
  children,
  href,
  linkLabel = "Всички",
  as: Heading = "h2",
  id,
}: {
  children: ReactNode;
  href?: string | undefined;
  linkLabel?: string;
  as?: "h1" | "h2" | "h3";
  id?: string | undefined;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <Heading id={id} className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink">
        <span className="np-ring" aria-hidden="true" />
        {children}
      </Heading>
      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-link hover:bg-surface-2"
        >
          {linkLabel}
          <ArrowRightIcon width={15} height={15} />
        </Link>
      ) : null}
    </div>
  );
}

export function TimeMeta({ date, className = "" }: { date: Date; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium text-muted ${className}`}>
      <ClockIcon width={13} height={13} />
      <time dateTime={isoDate(date)}>{formatShort(date)}</time>
    </span>
  );
}

export function ArticleImage({
  media,
  className = "",
  priority = false,
  sizes,
}: {
  media: Media | null;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (!media) return <div className={`np-img np-img-empty ${className}`} aria-hidden="true" />;
  return (
    <img
      src={media.url}
      alt={media.alt}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      className={`np-img ${className}`}
    />
  );
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "ghost" }) {
  const styles =
    variant === "primary"
      ? "np-gradient-bg text-on-accent shadow-card hover:brightness-110"
      : "border border-line bg-surface text-ink hover:bg-surface-2";
  return (
    <Link href={href} className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition ${styles}`}>
      {children}
    </Link>
  );
}
