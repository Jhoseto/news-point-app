import Link from "next/link";
import { imagePresentation } from "@newspoint/content";
import type { CSSProperties, ReactNode } from "react";
import type { CategoryRef, Media } from "@/lib/queries";
import { articleImageAttrs } from "@/lib/article-image";
import { formatCardTime, formatShort, isoDate } from "@/lib/format";
import { categoryAccentStyle } from "@/lib/category-accent";
import { ArrowRightIcon, ClockIcon } from "./icons";

export function CategoryPill({ category, glass = true, className = "" }: { category: CategoryRef; glass?: boolean; className?: string }) {
  const look = glass
    ? "border border-white/45 bg-white/15 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.45)] backdrop-blur-md"
    : "bg-accent text-on-accent";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-px text-[0.5rem] leading-none font-bold tracking-[0.06em] uppercase 2xl:px-2 2xl:py-0.5 2xl:text-[0.625rem] ${look} ${className}`}>
      {category.name}
    </span>
  );
}

/** Small category label with a gradient dot, used on cards. */
export function CategoryLabel({ category }: { category: CategoryRef }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.625rem] font-bold tracking-[0.08em] text-accent uppercase 2xl:text-[0.6875rem] dark:text-link" style={categoryAccentStyle(category.slug)}>
      <span className="np-category-dot size-1.5 rounded-full" aria-hidden="true" />
      {category.name}
    </span>
  );
}

export function NewBadge({ publishedAt, compact = false }: { publishedAt: Date; compact?: boolean }) {
  const remainingSeconds = Math.max(0, (publishedAt.getTime() + 60 * 60 * 1000 - Date.now()) / 1000);
  return (
    <span
      className={`np-new-badge inline-flex items-center rounded-full border border-white/55 bg-[#0b1552]/85 font-extrabold text-white shadow-[0_3px_14px_rgb(0_0_0/0.24)] backdrop-blur-sm ${compact ? "gap-1 px-1.5 py-px text-[0.5625rem] tracking-[0.08em]" : "gap-1.5 px-2 py-0.5 text-[0.625rem] tracking-[0.1em] 2xl:px-2.5 2xl:py-1"}`}
      style={{ "--np-new-ttl": `${remainingSeconds}s` } as CSSProperties}
    >
      <span className={`np-new-dot rounded-full bg-[#ffdc80] ${compact ? "size-1" : "size-1.5"}`} aria-hidden="true" />
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
  /** Skip srcset (carousel clones / decorative copies) to shrink HTML. */
  lite = false,
}: {
  media: Media | null;
  className?: string;
  priority?: boolean;
  sizes?: string;
  objectPosition?: string;
  imageTransform?: { scale: number; origin: string };
  lite?: boolean;
}) {
  if (!media) return <div className={`np-img np-img-empty ${className}`} aria-hidden="true" />;
  const presentation = imagePresentation(media);
  const { src, srcSet, sizes: resolvedSizes } = articleImageAttrs(media, {
    priority,
    lite,
    ...(sizes !== undefined ? { sizes } : {}),
  });
  return (
    <img
      src={src}
      alt={media.alt}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      sizes={resolvedSizes}
      srcSet={srcSet}
      style={{ ...(presentation.objectPosition ? { objectPosition: presentation.objectPosition } : {}), ...(objectPosition ? { objectPosition } : {}), ...(imageTransform ? { transform: `scale(${imageTransform.scale})`, transformOrigin: imageTransform.origin } : {}) }}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
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
