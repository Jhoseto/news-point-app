"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { LatestHeadline } from "@/lib/livepoint/types";
import { formatCardTime } from "@/lib/format";
import { categoryAccentStyle } from "@/lib/category-accent";
import { ArrowRightIcon } from "../icons";
import { ArticleImage, CategoryLabel } from "../ui";

/** Uses the header's existing article payload; no hover requests or route prefetch. */
export function LatestHeadlineCapsule({ latest }: { latest: LatestHeadline }) {
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(latest.asOfMs);
  const previewId = useId();
  const publishedAt = new Date(latest.publishedAt);
  const age = formatCardTime(publishedAt, new Date(nowMs));

  useEffect(() => {
    const sync = () => {
      if (!document.hidden) setNowMs(Date.now());
    };
    sync();
    const timer = setInterval(sync, 60_000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [latest.id]);

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, { passive: true });
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close);
    };
  }, []);

  return (
    <div
      className="np-lp-latest relative ml-auto hidden min-w-0 max-w-[38rem] flex-1 pl-5 xl:block"
      data-preview-open={open || undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches) setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <Link
        href={latest.path}
        prefetch={false}
        aria-describedby={open && latest.excerpt ? `${previewId}-summary` : undefined}
        className="np-headline-capsule group flex h-10 min-w-0 items-center gap-2.5 rounded-xl border border-line py-1 pr-2.5 pl-1"
      >
        <span className="size-8 shrink-0 overflow-hidden rounded-lg bg-surface-2" aria-hidden="true">
          {latest.hero ? <ArticleImage media={{ ...latest.hero, alt: "" }} className="h-full w-full object-cover" sizes="32px" /> : <span className="np-ring mx-auto mt-2 !size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[0.5625rem] leading-tight font-bold tracking-wide text-muted">
            <span className="truncate text-logo uppercase">Последна новина</span>
            <span aria-hidden="true">·</span>
            <time dateTime={latest.publishedAt} className="shrink-0 font-medium tracking-normal">{age}</time>
          </span>
          <span className="mt-0.5 block truncate text-[0.75rem] leading-tight font-semibold text-ink">{latest.title}</span>
        </span>
        <ArrowRightIcon width={14} height={14} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-logo" />
      </Link>

      {open ? (
        <div className="np-headline-flyout absolute top-full right-0 w-[22rem] max-w-[calc(100*var(--np-desktop-vw,1vw)-2rem)] pt-3">
          <div id={previewId} className="np-headline-preview np-scroll-soft relative max-h-[calc(var(--np-desktop-height,100dvh)-9rem)] overflow-y-auto rounded-2xl border border-line bg-surface shadow-[0_22px_60px_-16px_rgb(10_20_84/0.3)] dark:shadow-[0_22px_60px_-16px_rgb(0_0_0/0.8)]" style={categoryAccentStyle(latest.category?.slug)}>
            <span aria-hidden="true" className="np-category-accent-line absolute inset-x-0 top-0 z-10 h-0.5" />
            {latest.hero ? <div className="h-40 overflow-hidden"><ArticleImage media={{ ...latest.hero, alt: "" }} className="h-full w-full object-cover" sizes="352px" /></div> : null}
            <div className="p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                {latest.category ? <CategoryLabel category={latest.category} /> : <span />}
                <time dateTime={latest.publishedAt} className="text-[0.6875rem] font-medium text-muted">{age}</time>
              </div>
              <p className="text-base leading-snug font-extrabold tracking-tight text-ink">{latest.title}</p>
              {latest.excerpt ? <p id={`${previewId}-summary`} className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{latest.excerpt}</p> : null}
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className="truncate text-xs font-medium text-muted">{latest.authorName}</span>
                <Link href={latest.path} prefetch={false} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-bold text-link">Прочети <ArrowRightIcon width={13} height={13} /></Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
