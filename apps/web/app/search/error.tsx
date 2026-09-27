"use client";

export default function SearchError({ reset }: { reset: () => void }) {
  return <div data-np-search-archive role="alert" className="np-container py-10"><div className="np-card flex flex-col items-start gap-4 p-6"><h1 className="text-2xl font-bold text-ink">Търсенето временно не е достъпно</h1><p className="text-body">Опитайте отново след малко.</p><button type="button" onClick={reset} className="np-gradient-bg min-h-11 rounded-full px-5 py-2.5 font-bold text-on-accent">Опитай отново</button></div></div>;
}
