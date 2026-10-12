"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  articleReadRequestBody,
  isArticleReadRevisit,
  markArticleReadCounted,
  markArticleReadsEligibleAfterNavigation,
  shareArticleRead,
  shouldSendArticleRead,
} from "@/lib/article-read";
import { EyeIcon } from "./icons";

const formatter = new Intl.NumberFormat("bg-BG");

async function sendArticleRead(articleId: string, revisit: boolean): Promise<number | null> {
  const response = await fetch(`/api/articles/${articleId}/read/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: articleReadRequestBody(revisit),
  });
  if (!response.ok) return null;
  const result = await response.json() as { count?: unknown };
  const count = typeof result.count === "number" ? result.count : Number(result.count);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function ArticleReadCount({ articleId, initialCount }: { articleId: string; initialCount: number | null }) {
  const [count, setCount] = useState(initialCount);
  const pathname = usePathname();
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    markArticleReadsEligibleAfterNavigation(sessionStorage);
    previousPath.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (initialCount === null) return;
    const storage = sessionStorage;
    const revisit = isArticleReadRevisit(articleId, storage);
    if (!shouldSendArticleRead(articleId, storage)) return;

    let ignore = false;
    void shareArticleRead(articleId, () => sendArticleRead(articleId, revisit).catch(() => null)).then((next) => {
      if (ignore || next === null) return;
      markArticleReadCounted(articleId, storage);
      setCount(next);
    });

    return () => { ignore = true; };
  }, [articleId, initialCount]);

  const unavailable = count === null;
  return (
    <span className="np-article-read-stat" title={unavailable ? "Статистиката ще бъде активна след прилагане на миграция 17." : undefined}>
      <EyeIcon width={16} height={16} />
      <span><strong>Прегледи</strong>{unavailable ? "—" : formatter.format(count)}</span>
    </span>
  );
}
