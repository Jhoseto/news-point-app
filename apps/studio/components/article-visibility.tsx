"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@/lib/paths";

export function ArticleVisibility({ id, visible }: { id: string; visible: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(visible);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setPending(true);
    try {
      const response = await fetch(withBase(`/api/editor/articles/${id}/visibility/`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visible: next }),
      });
      if (!response.ok) throw new Error("failed");
      const result = (await response.json()) as { isPublic?: boolean };
      setOn(result.isPublic ?? next);
      router.refresh();
    } catch {
      setOn(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending}
      aria-pressed={on}
      title={on ? "Вижда се на сайта" : "Скрита е от сайта"}
      aria-label={on ? "Скрий от сайта" : "Покажи на сайта"}
      className={`grid size-7 place-items-center rounded-md border border-transparent ${on ? "text-ink hover:border-line hover:bg-surface-2" : "text-faint hover:border-line hover:bg-surface-2 hover:text-muted"} disabled:opacity-50`}
    >
      {on ? <EyeIcon /> : <EyeOffIcon />}
    </button>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2" />
      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.2 18.2 0 0 1-3.2 4.2" />
      <path d="M6.1 6.1C3.5 8 2 12 2 12s3.5 7 10 7a10.6 10.6 0 0 0 4.1-.8" />
    </svg>
  );
}
