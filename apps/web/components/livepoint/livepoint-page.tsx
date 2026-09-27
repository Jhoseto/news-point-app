import Link from "next/link";
import type { ReactNode } from "react";

export function LivePointPage({ title, lead, wide, full, compact, stickyHeader, children }: {
  title: string;
  lead?: string;
  wide?: boolean;
  full?: boolean;
  compact?: boolean;
  /** Keeps breadcrumb + title pinned under the site LivePoint bar while scrolling. */
  stickyHeader?: boolean;
  children: ReactNode;
}) {
  const width = full ? "max-w-[100rem]" : wide ? "max-w-5xl" : "max-w-3xl";
  const heading = (
    <>
      <nav className={`text-sm ${stickyHeader ? "mb-1.5" : compact ? "mb-2" : "mb-5"}`}>
        <Link href="/" className="font-semibold text-link hover:text-logo">
          Начало
        </Link>
        <span className="text-muted"> / {title}</span>
      </nav>
      <h1
        className={`flex items-center gap-2.5 font-extrabold tracking-tight text-ink ${compact ? "text-2xl sm:text-[1.65rem]" : "text-3xl"}`}
      >
        <span className="np-ring" aria-hidden="true" />
        {title}
      </h1>
      {lead ? (
        <p className={`max-w-3xl text-body ${compact ? "mt-1.5 text-sm text-muted" : "mt-3 text-base"}`}>{lead}</p>
      ) : null}
    </>
  );

  return (
    <div className={`np-container ${compact ? "py-5 sm:py-6" : "py-8"} ${width}`}>
      {stickyHeader ? (
        <div className="np-livepoint-page-head sticky z-30 -mx-4 border-b border-line bg-page/92 px-4 pb-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {heading}
        </div>
      ) : (
        heading
      )}
      <div className={stickyHeader ? "mt-4" : compact ? "mt-4" : "mt-6"}>{children}</div>
    </div>
  );
}
