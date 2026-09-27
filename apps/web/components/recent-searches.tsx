"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addRecentSearch, readRecentSearches, RECENT_SEARCH_KEY, type RecentSearch } from "@/lib/recent-searches";
import { searchPageUrl } from "@/lib/search";

export function RecentSearches({ query, record }: { query: string; record: boolean }) {
  const [items, setItems] = useState<RecentSearch[]>([]);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    try {
      const stored = readRecentSearches(localStorage);
      const next = record ? addRecentSearch(stored, query) : stored;
      if (record) localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      setItems(next); setUnavailable(false); setCleared(false);
    } catch { setUnavailable(true); }
    setReady(true);
  }, [query, record]);

  if (!ready) return null;
  if (unavailable) return <p className="text-sm text-muted">Скорошните търсения не са достъпни в този браузър.</p>;
  if (!items.length && !cleared) return null;
  return (
    <section aria-label="Скорошни търсения на това устройство" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <h2 className="font-semibold text-muted">Скорошни <span className="font-normal">· на това устройство</span></h2>
        {items.length ? <button type="button" className="min-h-9 font-semibold text-accent hover:underline" onClick={() => {
          try { localStorage.removeItem(RECENT_SEARCH_KEY); setItems([]); setCleared(true); }
          catch { setUnavailable(true); }
        }}>Изчисти</button> : null}
      </div>
      <ul className="flex flex-wrap gap-2">
        {items.map(item => <li key={item.query} className="min-w-0 max-w-full"><Link href={searchPageUrl(item.query)} prefetch={false} className="inline-flex max-w-full rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-semibold break-words text-body transition hover:border-accent hover:text-accent">{item.query}</Link></li>)}
      </ul>
      <p role="status" className="text-sm text-muted">{cleared ? "Скорошните търсения са изчистени." : null}</p>
    </section>
  );
}
