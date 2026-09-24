"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { formatShort } from "@/lib/format";
import { SEARCH_MAX_LENGTH, SEARCH_PAGE, searchPageUrl, searchTerms, type SearchHit } from "@/lib/search";
import { ArrowRightIcon, CloseIcon, SearchIcon } from "./icons";

type Status = "idle" | "loading" | "done" | "error";

const DEBOUNCE_MS = 180;

function useSearch(query: string) {
  const [state, setState] = useState<{ status: Status; hits: SearchHit[]; for: string }>({ status: "idle", hits: [], for: "" });

  useEffect(() => {
    if (!searchTerms(query).length) {
      setState({ status: "idle", hits: [], for: "" });
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ ...current, status: "loading" }));
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { hits: SearchHit[] };
        setState({ status: "done", hits: data.hits, for: query });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error", hits: [], for: query });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return state;
}

/**
 * Header search over the published articles (title and excerpt).
 * Combobox pattern: arrows move through results, Enter opens one or the full results page.
 * `autoFocus` marks the field for the opening sheet to focus (see `useModal` in nav.tsx).
 */
export function SiteSearch({ variant = "header", autoFocus = false, onNavigate }: { variant?: "header" | "sheet"; autoFocus?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const { status, hits } = useSearch(query);
  const ready = searchTerms(query).length > 0;
  const showPanel = variant === "sheet" ? query.length > 0 : open && query.length > 0;

  useEffect(() => setActive(-1), [hits]);

  useEffect(() => {
    if (variant !== "header") return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable=true]");
      if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [variant]);

  function go(path: string) {
    setOpen(false);
    onNavigate?.();
    router.push(path);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && hits.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % hits.length);
    } else if (event.key === "ArrowUp" && hits.length) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? hits.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = hits[active];
      if (hit) go(hit.path);
      else if (ready) go(searchPageUrl(query));
    } else if (event.key === "Escape") {
      if (open && query) {
        event.stopPropagation();
        setOpen(false);
      } else if (query) {
        setQuery("");
      }
    }
  }

  const activeId = active >= 0 && hits[active] ? `${listId}-${active}` : undefined;
  const sheet = variant === "sheet";

  return (
    <div ref={rootRef} className="relative w-full" data-site-search>
      <form
        role="search"
        action={SEARCH_PAGE}
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) go(searchPageUrl(query));
        }}
        className={`np-search group relative flex items-center gap-2.5 rounded-2xl border border-line bg-surface-2/70 px-3.5 transition-[border-color,background-color,box-shadow] duration-200 focus-within:border-accent/60 focus-within:bg-surface focus-within:shadow-[0_0_0_4px_rgb(56_24_214/0.10)] hover:border-accent/30 dark:focus-within:shadow-[0_0_0_4px_rgb(106_60_240/0.22)] ${sheet ? "h-14" : "h-11"}`}
      >
        <SearchIcon width={19} height={19} className="shrink-0 text-muted transition-colors group-focus-within:text-accent dark:group-focus-within:text-link" />
        <label htmlFor={`${listId}-input`} className="sr-only">
          Търсене в новините
        </label>
        <input
          ref={inputRef}
          id={`${listId}-input`}
          name="q"
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={SEARCH_MAX_LENGTH}
          data-autofocus={autoFocus || undefined}
          value={query}
          placeholder="Търсене…"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-[0.9375rem] font-medium text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Изчисти търсенето"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
          >
            <CloseIcon width={16} height={16} />
          </button>
        ) : variant === "header" ? (
          <kbd className="hidden shrink-0 rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[0.6875rem] font-bold text-muted xl:block" aria-hidden="true">
            /
          </kbd>
        ) : null}
        <span className="np-search-line" aria-hidden="true" />
      </form>

      {showPanel ? (
        <div
          className={
            sheet
              ? "mt-4"
              : "np-card absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden shadow-[0_24px_48px_-20px_rgb(10_20_84/0.35)]"
          }
        >
          {!ready ? (
            <p className="px-4 py-3.5 text-sm text-muted">Въведете поне 2 букви.</p>
          ) : status === "error" ? (
            <p role="alert" className="px-4 py-3.5 text-sm font-semibold text-ink">
              Търсенето не отговаря. Опитайте отново.
            </p>
          ) : hits.length === 0 && status === "loading" ? (
            <p className="flex items-center gap-2 px-4 py-3.5 text-sm text-muted" role="status">
              <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
              Търсене…
            </p>
          ) : hits.length === 0 ? (
            <div className="px-4 py-4" role="status">
              <p className="text-sm font-bold text-ink">Няма резултати за „{query.trim()}“.</p>
              <p className="mt-1 text-sm text-muted">Опитайте с друга дума или по-кратка фраза.</p>
            </div>
          ) : (
            <>
              <ul id={listId} role="listbox" aria-label="Резултати" className={`flex flex-col ${sheet ? "gap-1" : "max-h-[min(28rem,70dvh)] overflow-y-auto p-1.5"}`}>
                {hits.map((hit, index) => (
                  <li key={hit.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
                    <Link
                      href={hit.path}
                      tabIndex={-1}
                      onClick={() => {
                        setOpen(false);
                        onNavigate?.();
                      }}
                      onMouseEnter={() => setActive(index)}
                      className={`flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${index === active ? "bg-surface-2" : "hover:bg-surface-2"}`}
                    >
                      {hit.image ? (
                        <img src={hit.image} alt="" loading="lazy" className="np-img aspect-[4/3] w-16 shrink-0 rounded-lg" />
                      ) : (
                        <span className="np-img flex aspect-[4/3] w-16 shrink-0 items-center justify-center rounded-lg" aria-hidden="true">
                          <span className="np-ring !size-4 opacity-60" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm leading-snug font-bold text-ink">{hit.title}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {hit.category ? `${hit.category} · ` : ""}
                          {formatShort(new Date(hit.publishedAt))}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={searchPageUrl(query)}
                tabIndex={-1}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className={`flex items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-link hover:bg-surface-2 ${sheet ? "mt-2 rounded-xl" : "border-t border-line"}`}
              >
                Всички резултати за „{query.trim()}“
                <ArrowRightIcon width={16} height={16} />
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
