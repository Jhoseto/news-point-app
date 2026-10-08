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

type SrcEntry = { url: string; width: number };

function parseSrcSet(srcSet: string | undefined): SrcEntry[] {
  if (!srcSet) return [];
  return srcSet
    .split(",")
    .map((part) => {
      const [url, descriptor] = part.trim().split(/\s+/);
      const width = Number.parseInt(descriptor ?? "", 10);
      return { url, width: Number.isFinite(width) ? width : Number.POSITIVE_INFINITY };
    })
    .filter((entry): entry is SrcEntry => Boolean(entry.url));
}

/** Card/list srcset: mid rungs only (never pull a 2–4k master for a 22vw tile). */
function compactSrcSet(srcSet: string | undefined, maxWidth: number): string | undefined {
  let entries = parseSrcSet(srcSet);
  if (!entries.length) return undefined;
  const capped = entries.filter((entry) => entry.width <= maxWidth);
  if (capped.length >= 1) entries = capped;
  if (entries.length <= 3) {
    return entries.map((entry) => `${entry.url} ${entry.width}w`).join(", ");
  }
  const largest = entries[entries.length - 1]!.width;
  const targets = [320, 768, largest];
  const picked: SrcEntry[] = [];
  for (const target of targets) {
    const best = entries.reduce((a, b) => (Math.abs(b.width - target) < Math.abs(a.width - target) ? b : a));
    if (!picked.some((entry) => entry.url === best.url)) picked.push(best);
  }
  return picked
    .sort((a, b) => a.width - b.width)
    .map((entry) => `${entry.url} ${entry.width}w`)
    .join(", ");
}

/** Rough DPR-aware ceiling from the CSS `sizes` string (default `src` before srcset picks). */
function preferWidthFromSizes(sizes: string | undefined, fallback: number): number {
  if (!sizes) return fallback;
  const px = sizes.trim().match(/^(\d+)px$/);
  if (px) return Math.min(1280, Math.max(320, Number(px[1]) * 2));
  if (/\b(22|25|33)vw\b/.test(sizes)) return 640;
  if (/\b(42|46|50)vw\b/.test(sizes)) return 960;
  // Mobile lead is height-capped (~16rem); prefer ≤800 so 768w wins over a ~824 master.
  if (sizes.includes("100vw")) return 800;
  return fallback;
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
  // Always cap: priority lead ≤1280, cards ≤960 — masters stay out of srcset.
  const srcSet = lite ? undefined : compactSrcSet(presentation.srcSet, priority ? 1280 : 960);
  // Prefer a mid/small variant as the default `src` so the browser never starts
  // with a 1400px original when a card-sized file exists (critical for LCP).
  const srcFromSet = (set: string | undefined, preferMaxWidth: number) => {
    const entries = parseSrcSet(set);
    if (!entries.length) return media.url;
    const fit = [...entries].reverse().find((entry) => entry.width <= preferMaxWidth);
    return (fit ?? entries[0])!.url;
  };
  const prefer = preferWidthFromSizes(sizes, priority ? 960 : 640);
  const src = lite
    ? srcFromSet(presentation.srcSet, Math.min(640, prefer))
    : srcFromSet(srcSet ?? presentation.srcSet, prefer);
  return (
    <img
      src={src}
      alt={media.alt}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      sizes={lite ? undefined : sizes}
      srcSet={srcSet}
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
