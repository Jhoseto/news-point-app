"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { formatFull, isoDate } from "@/lib/format";
import type { ArticleSummary } from "@/lib/queries";
import { ArticleImage } from "./ui";

function NeighbourCard({ article, direction, enablePointerTracking }: {
  article: ArticleSummary;
  direction: "previous" | "next";
  enablePointerTracking?: boolean;
}) {
  const previous = direction === "previous";
  const router = useRouter();

  const navigate = useCallback(() => {
    router.push(article.path);
  }, [article.path, router]);

  const onPointerDown = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    if (!enablePointerTracking) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const startTime = event.timeStamp;
    let dominant: "h" | "v" = "h";
    let lastX = startX;
    let lastY = startY;
    let tracking = true;

    const finish = (dx: number, dt: number) => {
      tracking = false;
      if (dominant !== "h") return;
      if (Math.abs(dx) < 80) return;
      if (dt > 600) return;
      // Only forward swipe (left) on next, back swipe (right) on previous.
      if (direction === "next" && dx < 0) navigate();
      if (direction === "previous" && dx > 0) navigate();
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (!tracking) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const stepX = Math.abs(moveEvent.clientX - lastX);
      const stepY = Math.abs(moveEvent.clientY - lastY);
      if (stepY > stepX * 1.4) dominant = "v";
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      if (dominant === "v" && Math.abs(dy) > 12) {
        tracking = false;
        target.releasePointerCapture?.(moveEvent.pointerId);
      }
      if (Math.abs(dx) > 120) {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
        finish(dx, moveEvent.timeStamp - startTime);
      }
    };

    const onUp = (upEvent: PointerEvent) => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      const dx = upEvent.clientX - startX;
      finish(dx, upEvent.timeStamp - startTime);
    };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers reject setPointerCapture; the up/move listeners still work.
    }
  };

  return (
    <Link
      href={article.path}
      rel={previous ? "prev" : "next"}
      onPointerDown={onPointerDown}
      className={`np-article-neighbour is-${direction}`}
    >
      {article.hero ? <ArticleImage media={article.hero} sizes="(min-width: 640px) 112px, 96px" className="np-article-neighbour-image" /> : <span className="np-article-neighbour-image np-article-neighbour-placeholder" aria-hidden="true" />}
      <span className="np-article-neighbour-copy">
        <span className="np-article-neighbour-direction"><span aria-hidden="true">{previous ? "←" : "→"}</span>{previous ? "Предишна новина" : "Следваща новина"}</span>
        <strong>{article.title}</strong>
        <span className="np-article-neighbour-meta">
          {article.category?.name ? <span>{article.category.name}</span> : null}
          <time dateTime={isoDate(article.publishedAt)}>{formatFull(article.publishedAt)}</time>
        </span>
      </span>
    </Link>
  );
}

export function ArticleNeighbours({ older, newer }: { older: ArticleSummary | null; newer: ArticleSummary | null }) {
  if (!older && !newer) return null;
  return (
    <>
      {/* Phone: a single „Следваща новина" card; left-swipe navigates to it. */}
      {newer ? (
        <nav className="lg:hidden" aria-label="Следваща новина">
          <NeighbourCard article={newer} direction="next" enablePointerTracking />
        </nav>
      ) : null}
      {/* Desktop and tablet: both chronological neighbours. */}
      {older || newer ? (
        <nav className="np-article-neighbours hidden lg:grid" aria-label="Предишна и следваща новина">
          {older ? <NeighbourCard article={older} direction="previous" /> : <span />}
          {newer ? <NeighbourCard article={newer} direction="next" /> : null}
        </nav>
      ) : null}
    </>
  );
}
