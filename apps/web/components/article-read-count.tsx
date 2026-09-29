"use client";

import { useEffect, useState } from "react";
import { shareArticleRead } from "@/lib/article-read";
import { EyeIcon } from "./icons";

const formatter = new Intl.NumberFormat("bg-BG");

async function sendArticleRead(articleId: string): Promise<number | null> {
  const response = await fetch(`/api/articles/${articleId}/read/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!response.ok) return null;
  const result = await response.json() as { count?: unknown };
  const count = typeof result.count === "number" ? result.count : Number(result.count);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function ArticleReadCount({ articleId, initialCount }: { articleId: string; initialCount: number | null }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    if (initialCount === null) return;
    let ignore = false;
    void shareArticleRead(articleId, () => sendArticleRead(articleId).catch(() => null)).then((next) => {
      if (!ignore && next !== null) setCount(next);
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
