import Link from "next/link";
import type { ReactNode } from "react";

export function LivePointPage({ title, lead, wide, children }: { title: string; lead?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`np-container py-8 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
      <nav className="mb-5 text-sm">
        <Link href="/" className="font-semibold text-link hover:text-logo">
          Начало
        </Link>
        <span className="text-muted"> / {title}</span>
      </nav>
      <h1 className="flex items-center gap-2.5 text-3xl font-extrabold tracking-tight text-ink">
        <span className="np-ring" aria-hidden="true" />
        {title}
      </h1>
      {lead ? <p className="mt-3 max-w-2xl text-base text-body">{lead}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}
