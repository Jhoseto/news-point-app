"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  articleReadRequestBody,
  markArticleReadCounted,
  markArticleReadsEligibleAfterNavigation,
  shareArticleRead,
  shouldSendArticleRead,
} from "@/lib/article-read";
import { EyeIcon } from "./icons";
import { currentCookieConsent, useCookieConsent } from "./cookie-consent-store";

const formatter = new Intl.NumberFormat("bg-BG");

async function sendArticleRead(articleId: string): Promise<number | null> {
  const response = await fetch(`/api/articles/${articleId}/read/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: articleReadRequestBody(),
  });
  if (!response.ok || response.status === 204) return null;
  const result = await response.json() as { count?: unknown };
  const count = typeof result.count === "number" ? result.count : Number(result.count);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function ArticleReadCount({ articleId, initialCount }: { articleId: string; initialCount: number | null }) {
  const allowed = useCookieConsent().record?.statistics === true;
  const [count, setCount] = useState(initialCount);
  const pathname = usePathname();
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    if (allowed) try { markArticleReadsEligibleAfterNavigation(sessionStorage); } catch { /* Storage may be blocked. */ }
    previousPath.current = pathname;
  }, [pathname, allowed]);

  useEffect(() => {
    if (!allowed || initialCount === null) return;
    let storage: Storage;
    try { storage = sessionStorage; storage.getItem("np-read:v1:probe"); } catch { return; }
    if (!shouldSendArticleRead(articleId, storage)) return;

    let ignore = false;
    void shareArticleRead(articleId, () => sendArticleRead(articleId).catch(() => null)).then((next) => {
      if (ignore || next === null || !currentCookieConsent()?.statistics) return;
      try { markArticleReadCounted(articleId, storage); } catch { /* No local persistence. */ }
      setCount(next);
    });

    return () => { ignore = true; };
  }, [articleId, initialCount, allowed]);

  const unavailable = count === null;
  return (
    <span className="np-article-read-stat" title={unavailable ? "Статистиката ще бъде активна след прилагане на миграция 17." : undefined}>
      <EyeIcon width={16} height={16} />
      <span><strong>Прегледи</strong>{unavailable ? "—" : formatter.format(count)}</span>
    </span>
  );
}
