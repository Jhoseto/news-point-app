import Link from "next/link";
import { imagePresentation } from "@newspoint/content";
import type { CSSProperties, ReactNode } from "react";
import type { CategoryRef, Media } from "@/lib/queries";
import { formatCardTime, formatShort, isoDate } from "@/lib/format";
import { categoryAccentStyle } from "@/lib/category-accent";
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
    <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-wide text-accent uppercase dark:text-link" style={categoryAccentStyle(category.slug)}>
      <span className="np-category-dot size-1.5 rounded-full" aria-hidden="true" />
      {category.name}
    </span>
  );
}

export function NewBadge({ publishedAt }: { publishedAt: Date }) {
  const remainingSeconds = Math.max(0, (publishedAt.getTime() + 60 * 60 * 1000 - Date.now()) / 1000);
  return (
    <span className="np-new-badge inline-flex items-center gap-1.5 rounded-full border border-white/55 bg-[#0b1552]/85 px-2.5 py-1 text-[0.625rem] font-extrabold tracking-[0.1em] text-white shadow-[0_3px_14px_rgb(0_0_0/0.24)] backdrop-blur-sm" style={{ "--np-new-ttl": `${remainingSeconds}s` } as CSSProperties}>
      <span className="np-new-dot size-1.5 rounded-full bg-[#ffdc80]" aria-hidden="true" />
      НОВО
    </span>
  );
}

export function SectionTitle({
  children,
  href,
  linkLabel = "Всички",
  as: Heading = "h2",
  id,
  accentSlug,
}: {
  children: ReactNode;
  href?: string | undefined;
  linkLabel?: string;
  as?: "h1" | "h2" | "h3";
  id?: string | undefined;
  accentSlug?: string | undefined;
}) {
  return (
    <div className="np-section-heading mb-5 flex items-center justify-between gap-4" style={categoryAccentStyle(accentSlug)}>
      <Heading id={id} className="flex min-w-0 items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink sm:text-xl">
        <span className="np-ring" aria-hidden="true" />
        {children}
      </Heading>
      {href ? (
        <Link
          href={href}
          className="np-section-link group inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface/80 px-3 text-xs font-bold text-link shadow-[0_3px_12px_-8px_rgb(10_20_84/0.2)] transition-[border-color,background-color,box-shadow] hover:border-accent/30 hover:bg-surface hover:shadow-card sm:text-sm"
        >
          {linkLabel}
          <ArrowRightIcon width={15} height={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}

export function TimeMeta({ date, className = "", relative = false, now }: { date: Date; className?: string; relative?: boolean; now?: Date }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium text-muted ${className}`}>
      <ClockIcon width={13} height={13} />
      <time dateTime={isoDate(date)}>{relative ? formatCardTime(date, now) : formatShort(date, now)}</time>
    </span>
  );
}

export function ArticleImage({
  media,
  className = "",
  priority = false,
  sizes,
  objectPosition,
  imageTransform,
}: {
  media: Media | null;
  className?: string;
  priority?: boolean;
  sizes?: string;
  objectPosition?: string;
  imageTransform?: { scale: number; origin: string };
}) {
  if (!media) return <div className={`np-img np-img-empty ${className}`} aria-hidden="true" />;
  const presentation = imagePresentation(media);
  return (
    <img
      src={media.url}
      alt={media.alt}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      sizes={sizes}
      srcSet={presentation.srcSet}
      style={{ ...(presentation.objectPosition ? { objectPosition: presentation.objectPosition } : {}), ...(objectPosition ? { objectPosition } : {}), ...(imageTransform ? { transform: `scale(${imageTransform.scale})`, transformOrigin: imageTransform.origin } : {}) }}
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
    <Link href={href} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition ${styles}`}>
      {children}
    </Link>
  );
}
