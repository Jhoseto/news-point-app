"use client";

import Link from "next/link";

export default function PageError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="np-container flex min-h-[45dvh] items-center justify-center py-12">
      <div className="np-card flex w-full max-w-xl flex-col items-start gap-4 p-6 sm:p-8">
        <span className="np-ring !size-8" aria-hidden="true" />
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Страницата временно не е достъпна</h1>
        <p className="text-body">Опитайте пак. Ако проблемът продължи, можете да се върнете към началната страница.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="np-gradient-bg inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-on-accent">Опитай отново</button>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-bold text-ink hover:bg-surface-2">Към началото</Link>
        </div>
      </div>
    </div>
  );
}
