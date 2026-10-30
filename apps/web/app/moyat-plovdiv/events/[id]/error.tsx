"use client";

import Link from "next/link";

export default function CityEventError({ reset }: { reset: () => void }) {
  return <section role="alert" className="np-container flex min-h-[40dvh] flex-col items-start justify-center gap-5 py-12">
    <h1 className="text-2xl font-bold text-ink">Информацията за събитието временно не е достъпна</h1>
    <p className="max-w-xl text-body">В момента не можем да заредим актуалната програма. Това не означава, че събитието е отменено.</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={reset} className="np-gradient-bg inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-on-accent">Опитай отново</button>
      <Link href="/moyat-plovdiv/" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-bold text-ink">Към Моят Пловдив</Link>
    </div>
  </section>;
}
