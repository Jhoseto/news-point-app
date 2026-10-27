"use client";
import { useEffect, useState } from "react";
import { withBase } from "./paths";
import type { MonitoringView } from "@newspoint/content/error-monitoring";

export type MonitoringSummary = Pick<MonitoringView, "status" | "checkedAt" | "attentionAt" | "activeProblem">;
export const seenKey = (userKey: string) => `np-error-monitoring-seen:${userKey}`;
export const MONITORING_SEEN_EVENT = "np-error-monitoring-seen";
export function markMonitoringSeen(userKey: string, at: string) {
  if (!Number.isFinite(Date.parse(at))) return;
  const key = seenKey(userKey);
  try {
    const previous = localStorage.getItem(key);
    if (previous && previous >= at) return;
    localStorage.setItem(key, at);
  } catch { /* The current tab can still acknowledge when storage is unavailable. */ }
  window.dispatchEvent(new CustomEvent(MONITORING_SEEN_EVENT, { detail: { key, at } }));
}
export function needsMonitoringAttention(data: MonitoringSummary | null, seen: string | null, failed: boolean) {
  return data !== null && (!failed && data.activeProblem || !!data.attentionAt && (!seen || data.attentionAt > seen));
}
export function useMonitoring<T extends MonitoringSummary>(summary: boolean, enabled = true) {
  const [data, setData] = useState<T | null>(null), [failed, setFailed] = useState(false), [loading, setLoading] = useState(enabled);
  const [revision, refresh] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true, running = false, controller: AbortController | null = null;
    const load = async () => {
      if (!active || running || document.visibilityState === "hidden") return;
      running = true; controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12000);
      try {
        const response = await fetch(withBase(`/api/error-monitoring/${summary ? "?view=summary" : ""}`), { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("monitor-unavailable");
        const result = await response.json() as T;
        if (!["ok", "problem", "unknown"].includes(result.status) || typeof result.checkedAt !== "string") throw new Error("invalid-monitor");
        if (active) { setData(result); setFailed(false); }
      } catch { if (active) setFailed(true); }
      finally { clearTimeout(timeout); running = false; if (active) setLoading(false); }
    };
    void load(); const timer = setInterval(() => void load(), 20000);
    const focus = () => { void load(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    return () => { active = false; controller?.abort(); clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [summary, enabled, revision]);
  return { data, failed, loading, refresh: () => refresh(n => n + 1) };
}
