"use client";

import type { FormEvent, ReactNode } from "react";

export function ArticleFilterForm({ children }: { children: ReactNode }) {
  function onChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (target instanceof HTMLInputElement && (target.type === "search" || target.type === "text")) return;
    event.currentTarget.requestSubmit();
  }

  return (
    <form method="get" className="np-card mb-2 space-y-1.5 p-2" onChange={onChange}>
      {children}
    </form>
  );
}
