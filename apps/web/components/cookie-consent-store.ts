"use client";

import { useSyncExternalStore } from "react";
import { consentFromCookieHeader, createConsent, serializeConsent, OPEN_COOKIE_SETTINGS, type ConsentChoices, type ConsentRecord } from "../lib/cookie-consent";

type Snapshot = { ready: boolean; record: ConsentRecord | null; persistent: boolean };
const serverSnapshot: Snapshot = { ready: false, record: null, persistent: false };
let snapshot: Snapshot = serverSnapshot;
let initialized = false;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;
let stop: (() => void) | undefined;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

function emit() { for (const listener of listeners) listener(); }
function readRecord() {
  try { return consentFromCookieHeader(document.cookie); } catch { return null; }
}
function armExpiry() {
  clearTimeout(expiryTimer);
  if (!snapshot.record || !listeners.size) return;
  expiryTimer = setTimeout(() => {
    if (snapshot.record && snapshot.record.expiresAt <= Date.now()) {
      snapshot = { ready: true, record: null, persistent: false }; emit();
    }
    armExpiry();
  }, Math.min(snapshot.record.expiresAt - Date.now() + 1, 2_147_483_647));
}
function sync() {
  // A browser that blocks cookies can still honour the choice in this open tab.
  if (snapshot.record && !snapshot.persistent && snapshot.record.expiresAt > Date.now()) return;
  const record = readRecord();
  if (JSON.stringify(record) === JSON.stringify(snapshot.record)) return;
  snapshot = { ready: true, record, persistent: !!record }; emit(); armExpiry();
}
function getSnapshot(): Snapshot {
  if (!initialized) {
    initialized = true;
    const record = readRecord();
    snapshot = { ready: true, record, persistent: !!record };
  }
  return snapshot;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stop) {
    try { if (typeof BroadcastChannel !== "undefined") { channel = new BroadcastChannel("np-cookie-consent"); channel.onmessage = sync; } } catch { /* Focus still refreshes the cookie in older/private browsers. */ }
    const visible = () => { if (document.visibilityState === "visible") sync(); };
    window.addEventListener("focus", sync); document.addEventListener("visibilitychange", visible);
    stop = () => { window.removeEventListener("focus", sync); document.removeEventListener("visibilitychange", visible); channel?.close(); channel = undefined; clearTimeout(expiryTimer); };
    armExpiry();
  }
  return () => { listeners.delete(listener); if (!listeners.size) { stop?.(); stop = undefined; } };
}

export function saveCookieConsent(choices: ConsentChoices, action: ConsentRecord["action"]): boolean {
  const record = createConsent(choices, action);
  let persistent = false;
  try {
    document.cookie = serializeConsent(record, location.protocol === "https:");
    persistent = consentFromCookieHeader(document.cookie)?.savedAt === record.savedAt;
  } catch { /* An explicit choice can still be honoured in this open tab. */ }
  initialized = true; snapshot = { ready: true, record, persistent }; emit(); armExpiry();
  try { channel?.postMessage("changed"); } catch { /* Focus remains a fallback. */ }
  return persistent;
}
export const currentCookieConsent = () => getSnapshot().record;
export const openCookieSettings = () => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS));
export const useCookieConsent = () => useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
