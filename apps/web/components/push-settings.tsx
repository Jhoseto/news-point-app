"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  getBrowserPushSubscription,
  readPushSupport,
  setPushEnabled,
  subscribeForPush,
  syncPushCategorySlugs,
} from "@/lib/push-client";
import {
  readPushMasterEnabled,
  readStoredPushRubrics,
  writePushMasterEnabled,
  writeStoredPushRubrics,
} from "@/lib/push-preferences";

type Rubric = { slug: string; name: string };

export function PushSettings({ compact = true }: { compact?: boolean }) {
  const id = useId();
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [allRubrics, setAllRubrics] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState(false);
  const [needInstall, setNeedInstall] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const card = compact ? "np-card p-2.5 sm:p-3" : "np-card p-5 sm:p-7";
  const legend = compact ? "mb-0.5 text-xs font-extrabold text-ink" : "mb-2 text-lg font-extrabold text-ink";
  const hint = compact ? "mb-2 text-[11px] leading-snug text-muted" : "mb-5 text-sm leading-relaxed text-muted";

  const slugsForServer = useCallback((): string[] | null => {
    if (allRubrics) return null;
    const list = [...picked];
    return list.length > 0 ? list : null;
  }, [allRubrics, picked]);

  const syncPermissionState = useCallback(() => {
    const support = readPushSupport();
    void (async () => {
      const sub = await getBrowserPushSubscription();
      const granted = support.permission === "granted" && Boolean(sub);
      setActive(granted && readPushMasterEnabled());
    })();
  }, []);

  useEffect(() => {
    const support = readPushSupport();
    setUnsupported(!support.supported);
    setNeedInstall(support.needInstall);
    syncPermissionState();
    const stored = readStoredPushRubrics();
    if (stored && stored.length > 0) {
      setAllRubrics(false);
      setPicked(new Set(stored));
    }
    void fetch("/api/push/menu", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { categories?: Rubric[] } | null) => {
        if (data?.categories?.length) setRubrics(data.categories);
      })
      .catch(() => {});
    const onFocus = () => syncPermissionState();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [syncPermissionState]);

  const enable = async () => {
    if (busy || unsupported || needInstall) return;
    setBusy(true);
    setError(null);
    try {
      const result = await subscribeForPush({ categorySlugs: slugsForServer(), categorySlug: null });
      if (!result.ok) {
        setError(result.reason === "config" ? "Сървърът не е конфигуриран за нотификации." : "Неуспешно включване.");
        setActive(false);
        return;
      }
      writePushMasterEnabled(true);
      setActive(true);
      window.dispatchEvent(new Event("np-push-subscribed"));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await setPushEnabled(false);
      if (!ok) {
        setError("Неуспешно изключване.");
        return;
      }
      writePushMasterEnabled(false);
      setActive(false);
    } finally {
      setBusy(false);
    }
  };

  const applyRubrics = async (nextAll: boolean, nextPicked: Set<string>) => {
    const slugs = nextAll ? null : nextPicked.size > 0 ? [...nextPicked] : null;
    writeStoredPushRubrics(slugs);
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await syncPushCategorySlugs(slugs);
      if (!ok) setError("Рубриките не бяха запазени.");
    } finally {
      setBusy(false);
    }
  };

  if (unsupported) return null;

  if (needInstall) {
    return (
      <fieldset className={card}>
        <legend className={legend}>Нотификации</legend>
        <p className={hint}>На iPhone добавете NewsPoint към началния екран (Safari → сподели), за да получавате известия.</p>
      </fieldset>
    );
  }

  const btn = compact ? "min-h-9 text-xs" : "min-h-11 text-sm";

  return (
    <fieldset className={card} aria-describedby={`${id}-push-hint`}>
      <legend className={legend}>Нотификации</legend>
      <p id={`${id}-push-hint`} className={hint}>
        Известия за нови публикации — и когато браузърът е затворен (Web Push).
      </p>
      {active ? (
        <label className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2 ${compact ? "min-h-9" : "min-h-11 px-4 py-3"}`}>
          <span className={`font-bold text-ink ${compact ? "text-xs" : "text-sm"}`}>Новини по известие</span>
          <input
            type="checkbox"
            role="switch"
            aria-checked
            checked
            disabled={busy}
            onChange={() => void disable()}
            className="size-4 shrink-0 accent-accent"
          />
        </label>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className={`np-gradient-bg inline-flex w-full items-center justify-center rounded-lg px-3 py-2 font-bold text-on-accent disabled:opacity-50 ${btn}`}
        >
          {busy ? "…" : "Включи нотификации"}
        </button>
      )}
      {active ? (
        <div className={`mt-2 space-y-2 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-ink">
            <input
              type="checkbox"
              checked={allRubrics}
              onChange={(e) => {
                const on = e.target.checked;
                setAllRubrics(on);
                void applyRubrics(on, picked);
              }}
              className="size-3.5 accent-accent"
            />
            Всички рубрики
          </label>
          {!allRubrics && rubrics.length > 0 ? (
            <div className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto overscroll-contain sm:grid-cols-3">
              {rubrics.map((item) => (
                <label key={item.slug} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line/80 bg-surface px-1.5 py-1 text-[10px] leading-tight text-body">
                  <input
                    type="checkbox"
                    checked={picked.has(item.slug)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(item.slug);
                      else next.delete(item.slug);
                      setPicked(next);
                      void applyRubrics(false, next);
                    }}
                    className="size-3 shrink-0 accent-accent"
                  />
                  <span className="min-w-0 truncate">{item.name}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-1.5 text-[10px] text-muted">{error}</p> : null}
    </fieldset>
  );
}
