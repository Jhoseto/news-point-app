"use client";

import { useCallback, useEffect, useState } from "react";
import { PushClientError, pushErrorText, readPushServerState, readPushSupport, setPushEnabled, subscribeForPush } from "@/lib/push-client";

type Status = "checking" | "unsupported" | "blocked" | "ready" | "subscribed" | "denied";

/** Legacy rubric control uses the same ownership, lifecycle and server state. */
export function PushPermission({ categorySlug }: { categorySlug?: string | null }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);
  const [needInstall, setNeedInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    const support = readPushSupport();
    setSupported(support.supported);
    setNeedInstall(support.needInstall);
    if (!support.supported || support.needInstall) { setStatus("unsupported"); return; }
    if (support.permission === "denied") { setStatus("blocked"); return; }
    void readPushServerState().then((state) => { if (mounted) setStatus(state?.enabled && support.permission === "granted" ? "subscribed" : "ready"); })
      .catch((failure) => { if (mounted) { setStatus("ready"); setError(pushErrorText(failure)); } });
    return () => { mounted = false; };
  }, []);
  const subscribe = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await subscribeForPush({ categorySlug: categorySlug ?? null });
      if (!result.ok) { setError(pushErrorText(new PushClientError(result.reason))); setStatus(result.reason === "blocked" ? "blocked" : "ready"); return; }
      setStatus("subscribed");
    } finally { setBusy(false); }
  }, [busy, categorySlug, supported]);
  const unsubscribe = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true); setError(null);
    try {
      if (!(await setPushEnabled(false))) { setError("Изключването не е потвърдено. Опитайте отново."); return; }
      setStatus("ready");
    } finally { setBusy(false); }
  }, [busy, supported]);

  if (status === "checking") return null;
  if (needInstall) {
    return (
      <div role="status" aria-live="polite" className="np-card flex flex-col gap-2 p-4 text-sm">
        <strong className="font-bold text-ink">Нотификациите работят само в инсталираното приложение</strong>
        <span className="text-muted">Добавете NewsPoint.bg към началния екран от менюто за споделяне и отворете новата икона, за да включите известия.</span>
      </div>
    );
  }
  if (!supported) return null;
  if (status === "blocked") {
    return (
      <div role="status" className="np-card flex flex-col gap-2 p-4 text-sm">
        <strong className="font-bold text-ink">Нотификациите са изключени от настройките на браузъра</strong>
        <span className="text-muted">Разрешете известията за NewsPoint в системните настройки на устройството.</span>
      </div>
    );
  }
  if (status === "subscribed") {
    return (
      <div role="status" className="np-card flex items-center justify-between gap-3 p-4 text-sm">
        <div className="flex flex-col gap-0.5">
          <strong className="font-bold text-ink">Получавате нотификации</strong>
          <span className="text-muted">{categorySlug ? `Само за рубрика „${categorySlug}".` : "За всички издания."}</span>
        </div>
        <button
          type="button"
          onClick={unsubscribe}
          disabled={busy}
          className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface-2 px-4 py-1.5 text-xs font-bold text-body transition hover:bg-line disabled:opacity-50"
        >
          {busy ? "…" : "Спри"}
        </button>
      </div>
    );
  }
  return (
    <div className="np-card flex flex-col gap-2 p-4 text-sm">
      <strong className="font-bold text-ink">Следете новините от NewsPoint.bg</strong>
      <span className="text-muted">
        {categorySlug
          ? `Известия само за нови публикации в „${categorySlug}".`
          : "Известия при всяка нова публикация."}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={subscribe}
          disabled={busy}
          className="np-gradient-bg inline-flex min-h-11 items-center rounded-full px-5 py-2 text-sm font-bold text-on-accent disabled:opacity-50"
        >
          {busy ? "…" : "Разрешавам нотификации"}
        </button>
        {error ? <span className="text-xs text-muted">{error}</span> : null}
      </div>
    </div>
  );
}
