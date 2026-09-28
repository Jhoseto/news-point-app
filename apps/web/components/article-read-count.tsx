"use client";

import { useEffect, useState } from "react";
import { ARTICLE_READ_MINIMUM_MS, isEngagedArticleRead } from "@/lib/article-read";
import { EyeIcon } from "./icons";

const formatter = new Intl.NumberFormat("bg-BG");

export function ArticleReadCount({ articleId, initialCount }: { articleId: string; initialCount: number | null }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    if (initialCount === null) return;
    const storageKey = `np:read:${articleId}`;
    if (sessionStorage.getItem(storageKey)) return;
    const startedAt = Date.now();
    let sent = false;

    const progress = () => {
      const body = document.getElementById("np-article-body");
      if (!body) return 0;
      const rect = body.getBoundingClientRect();
      const travelled = window.innerHeight - rect.top;
      return Math.max(0, Math.min(1, travelled / Math.max(rect.height, 1)));
    };
    const record = async () => {
      if (sent || !isEngagedArticleRead(Date.now() - startedAt, progress())) return;
      sent = true;
      sessionStorage.setItem(storageKey, "1");
      try {
        const response = await fetch(`/api/articles/${articleId}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        if (!response.ok) return;
        const result = await response.json() as { count?: number };
        if (Number.isSafeInteger(result.count) && result.count! >= 0) setCount(result.count!);
      } catch {
        // Counting is enhancement-only and must never interrupt reading.
      }
    };
    const timer = window.setTimeout(() => void record(), ARTICLE_READ_MINIMUM_MS);
    const onScroll = () => void record();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.clearTimeout(timer); window.removeEventListener("scroll", onScroll); };
  }, [articleId, initialCount]);

  const unavailable = count === null;
  return (
    <span className="np-article-read-stat" title={unavailable ? "Статистиката ще бъде активна след прилагане на миграция 17." : undefined}>
      <EyeIcon width={16} height={16} />
      <span><strong>{unavailable ? "—" : formatter.format(count)}</strong> прочитания</span>
    </span>
  );
}
