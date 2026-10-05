"use client";

import { useId, useSyncExternalStore } from "react";
import { usePushSettings } from "./use-push-settings";
import { MobilePushSettings } from "./mobile-push-settings";

function subscribeWidth(callback: () => void) {
  const media = window.matchMedia("(max-width: 63.999rem)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
export function PushSettings({ compact = true }: { compact?: boolean }) {
  const id = useId();
  const push = usePushSettings();
  const mobile = useSyncExternalStore(subscribeWidth, () => window.matchMedia("(max-width: 63.999rem)").matches, () => false);
  if (mobile) return <MobilePushSettings push={push} />;
  const { busy, active, error, rubrics } = push;
  const allRubrics = push.slugs === null;
  const picked = new Set(push.slugs ?? []);
  const card = compact ? "np-card p-2.5 sm:p-3" : "np-card p-5 sm:p-7";
  const legend = compact ? "mb-0.5 text-xs font-extrabold text-ink" : "mb-2 text-lg font-extrabold text-ink";
  const hint = compact ? "mb-2 text-[11px] leading-snug text-muted" : "mb-5 text-sm leading-relaxed text-muted";
  if (push.support && !push.support.supported) return null;

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
            disabled={busy || push.loading}
            onChange={() => void push.disable()}
            className="size-4 shrink-0 accent-accent"
          />
        </label>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void push.enable()}
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
                void push.choose(e.target.checked ? null : []);
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
                      void push.choose([...next]);
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
