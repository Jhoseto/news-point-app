"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPushPublicKey, mutatePush, PushClientError, pushErrorText, readPushServerState, readPushSupport,
  subscribeForPush, type PushState, type PushSupport } from "@/lib/push-client";
import { readStoredPushRubrics, writeStoredPushRubrics } from "@/lib/push-preferences";

export function usePushSettings() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [server, setServer] = useState<PushState | null>(null);
  const [rubrics, setRubrics] = useState<{ slug: string; name: string }[]>([]);
  const [slugs, setSlugs] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busyRef = useRef(false);
  const revision = useRef(0);
  const alive = useRef(false);
  const accept = useCallback((state: PushState | null) => {
    setServer(state);
    if (state) setSlugs(state.categorySlugs);
  }, []);
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    const request = ++revision.current;
    const current = readPushSupport();
    setSupport(current);
    if (current.needInstall || !current.supported) { setLoading(false); return; }
    try {
      const state = await readPushServerState();
      if (!alive.current || request !== revision.current || busyRef.current) return;
      accept(state);
      setError(null);
      try { await getPushPublicKey(); if (alive.current && request === revision.current) setConfigured(true); }
      catch { if (alive.current && request === revision.current) setConfigured(false); }
    } catch (failure) {
      if (alive.current && request === revision.current) setError(pushErrorText(failure));
    } finally { if (alive.current && request === revision.current) setLoading(false); }
  }, [accept]);

  useEffect(() => {
    alive.current = true;
    setSlugs(readStoredPushRubrics());
    void refresh();
    const abort = new AbortController();
    void fetch("/api/push/menu/", { cache: "no-store", signal: abort.signal })
      .then(async (res) => { if (!res.ok) throw new Error(); return res.json() as Promise<{ categories: { slug: string; name: string }[] }>; })
      .then((data) => { if (alive.current) setRubrics(data.categories); })
      .catch(() => { if (alive.current && !abort.signal.aborted) setError("Рубриките не се заредиха. Обновете настройките."); });
    const onResume = () => { if (document.visibilityState === "visible") void refresh(); };
    const onOffline = () => setError("Няма връзка. Настройките ще могат да се потвърдят, когато сте онлайн.");
    for (const event of ["focus", "online", "np-pwa-ready", "np-push-change", "storage"]) window.addEventListener(event, onResume);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      alive.current = false; revision.current++; abort.abort();
      for (const event of ["focus", "online", "np-pwa-ready", "np-push-change", "storage"]) window.removeEventListener(event, onResume);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [refresh]);

  const run = async (kind: "enable" | "disable" | "test" | "preferences", next?: string[] | null) => {
    if (busyRef.current) return;
    busyRef.current = true; revision.current++;
    setBusy(true); setError(null); setNotice(null);
    try {
      if (kind === "enable") {
        // Call immediately; subscribeForPush requests permission in this click.
        const result = await subscribeForPush({ categorySlugs: slugs });
        if (!result.ok) throw new PushClientError(result.reason);
        if (alive.current) { accept(result.state); setSupport(readPushSupport()); }
      } else if (kind === "preferences" && !server) {
        if (next !== undefined && alive.current) { writeStoredPushRubrics(next); setSlugs(next); }
      } else {
        if (!server) throw new PushClientError("missing");
        const state = await mutatePush(kind === "preferences" ? "preferences" : kind, server.revision, next);
        if (alive.current) {
          accept(state);
          if (kind === "test") setNotice("Тестът е заявен. Проверете известията на телефона; при липса проверете системните разрешения.");
        }
      }
    } catch (failure) {
      if (alive.current) setError(pushErrorText(failure));
    } finally {
      busyRef.current = false;
      if (alive.current) { setBusy(false); setLoading(false); }
    }
  };
  return { support, server, rubrics, slugs, loading, busy, configured, error, notice, refresh,
    active: Boolean(server?.enabled && support?.permission === "granted"),
    enable: () => run("enable"), disable: () => run("disable"), test: () => run("test"),
    choose: (next: string[] | null) => run("preferences", next) };
}
export type PushController = ReturnType<typeof usePushSettings>;
