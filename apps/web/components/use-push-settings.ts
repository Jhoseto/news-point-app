"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPushMenu, getPushPublicKey, isCurrentPushSubscription, mutatePush, PushClientError, pushErrorText, readPushServerState, readPushSupport,
  subscribeForPush, type PushState, type PushSupport } from "@/lib/push-client";
import { readPushDisablePending, readStoredPushRubrics, writeStoredPushRubrics } from "@/lib/push-preferences";

export function usePushSettings() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [server, setServer] = useState<PushState | null>(null);
  const [rubrics, setRubrics] = useState<{ slug: string; name: string }[]>([]);
  const [slugs, setSlugs] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [needsRenewal, setNeedsRenewal] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busyRef = useRef(false);
  const revision = useRef(0);
  const alive = useRef(false);
  const accept = useCallback((state: PushState | null) => {
    setServer(state);
    setConfirmed(true);
    if (state) setSlugs(state.categorySlugs);
  }, []);
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    const request = ++revision.current;
    setLoading(true);
    setConfigured(false);
    setNeedsRenewal(false);
    const current = readPushSupport();
    setSupport(current);
    if (current.needInstall || !current.supported) { setLoading(false); return; }
    try {
      const state = await readPushServerState();
      if (!alive.current || request !== revision.current || busyRef.current) return;
      accept(state);
      setError(null);
      // Retry the rubric list with the same bounded fetch on every explicit refresh.
      // A menu failure must not prevent a device from opting out.
      try { const items = await getPushMenu(); if (alive.current && request === revision.current) setRubrics(items); }
      catch { if (alive.current && request === revision.current) setError("Рубриките не се заредиха. Проверете връзката и опитайте отново."); }
      try {
        const key = await getPushPublicKey();
        const current = await isCurrentPushSubscription(key);
        if (alive.current && request === revision.current) { setConfigured(true); setNeedsRenewal(Boolean(state?.enabled && !current)); }
      }
      catch { if (alive.current && request === revision.current) setConfigured(false); }
    } catch (failure) {
      if (alive.current && request === revision.current) { setConfirmed(false); setError(pushErrorText(failure)); }
    } finally { if (alive.current && request === revision.current) setLoading(false); }
  }, [accept]);

  useEffect(() => {
    alive.current = true;
    setSlugs(readStoredPushRubrics());
    void refresh();
    const onResume = () => { if (document.visibilityState === "visible") void refresh(); };
    const onOffline = () => setError("Няма връзка. Настройките ще могат да се потвърдят, когато сте онлайн.");
    for (const event of ["focus", "online", "np-pwa-ready", "np-push-change", "storage"]) window.addEventListener(event, onResume);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      alive.current = false; revision.current++;
      for (const event of ["focus", "online", "np-pwa-ready", "np-push-change", "storage"]) window.removeEventListener(event, onResume);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [refresh]);

  const run = async (kind: "enable" | "disable" | "test" | "preferences", next?: string[] | null) => {
    if (busyRef.current) return;
    // Refuse before subscribeForPush can ask the browser for permission.
    // Disabling an existing subscription stays available during a config outage.
    if (kind === "enable" && (loading || !confirmed || !configured)) {
      setError(pushErrorText(new PushClientError("config")));
      return;
    }
    busyRef.current = true; revision.current++;
    setBusy(true); setPending(kind); setError(null); setNotice(null);
    try {
      if (kind === "enable") {
        // Call immediately; subscribeForPush requests permission in this click.
        const result = await subscribeForPush({ categorySlugs: slugs });
        if (!result.ok) throw new PushClientError(result.reason);
        if (alive.current) { accept(result.state); setConfigured(true); setNeedsRenewal(false); setSupport(readPushSupport()); }
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
      if (alive.current) { setConfirmed(false); setSupport(readPushSupport()); setError(pushErrorText(failure)); }
    } finally {
      busyRef.current = false;
      if (alive.current) { setBusy(false); setPending(null); setLoading(false); }
    }
  };
  return { support, server, rubrics, slugs, loading, busy, pending, configured, confirmed, needsRenewal, error, notice, refresh, disablePending: readPushDisablePending(),
    active: Boolean(server?.enabled && !needsRenewal && support?.permission === "granted"),
    enable: () => run("enable"), disable: () => run("disable"), test: () => run("test"),
    choose: (next: string[] | null) => run("preferences", next) };
}
export type PushController = ReturnType<typeof usePushSettings>;
