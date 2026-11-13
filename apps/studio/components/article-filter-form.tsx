"use client";

import { useState, type FormEvent, type ReactNode } from "react";

export function ArticleFilterForm({ active, children }: { active: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(active);
  function onChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (target instanceof HTMLInputElement && (target.type === "search" || target.type === "text")) return;
    event.currentTarget.requestSubmit();
  }

  return (
    <form method="get" className="studio-article-filters np-card mb-2 space-y-1.5 p-2" data-expanded={open} onChange={onChange}>
      <button type="button" className="studio-article-filter-toggle np-btn np-btn-secondary hidden" aria-expanded={open} aria-controls="article-filter-fields article-filter-dates" onClick={() => setOpen(current => !current)}>
        Филтри
      </button>
      {children}
    </form>
  );
}
