"use client";

import type { PushAction, PushProof, PushState } from "@newspoint/db/push-domain";
import { readPushDisablePending, readStoredPushRubrics, writePushDisablePending, writePushMasterEnabled, writeStoredPushRubrics } from "./push-preferences";
export type { PushState } from "@newspoint/db/push-domain";
export type PushSupport = { supported: boolean; needInstall: boolean; installed: boolean; ios: boolean; permission: NotificationPermission | "unsupported" };

export function readPushSupport(): PushSupport {
  if (typeof window === "undefined") return { supported: false, needInstall: false, installed: false, ios: false, permission: "unsupported" };
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const supported = window.isSecureContext && "serviceWorker" in navigator && ("PushManager" in window || "pushManager" in window) && "Notification" in window;
  return { supported, installed, ios, needInstall: ios && !installed,
    permission: "Notification" in window ? Notification.permission : "unsupported" };
}

export class PushClientError extends Error {
  constructor(public code: string) { super(code); }
}
export function pushErrorText(error: unknown): string {
  const code = error instanceof PushClientError ? error.code : "network";
  const messages: Record<string, string> = {
    blocked: "Известията са блокирани. Разрешете ги от системните настройки за NewsPoint и опитайте отново.",
    denied: "Не дадохте разрешение. Можете да включите известията по-късно.",
    config: "Известията още не са активирани на този сървър.",
    conflict: "Настройките бяха променени в друг прозорец. Обновете ги и опитайте отново.",
    ownership: "Абонаментът не може да бъде потвърден. Опитайте след презареждане.",
    unavailable: "Сървърът за известия временно не е достъпен. Опитайте отново.",
    worker: "Приложението още не е готово за известия. Презаредете и опитайте отново.",
    rubrics: "Списъкът с рубрики се промени. Обновете настройките.",
    rate_limit: "Твърде много заявки. Изчакайте една минута.",
    test_rate_limit: "Можете да заявите един тест на минута.",
    disabled: "Първо включете известията за това устройство.",
    missing: "Абонаментът вече не е активен. Включете известията отново.",
    invalid: "Това устройство не е готово за известия.",
    network: "Няма връзка. Промяната не е потвърдена; опитайте отново.",
  };
  return messages[code] ?? messages.network!;
}

function bounded<T>(promise: Promise<T>, code = "worker", ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new PushClientError(code)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}
async function jsonFetch(url: string, body?: unknown) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 8000);
  try {
    const res = await fetch(url, { method: body === undefined ? "GET" : "POST", cache: "no-store", credentials: "same-origin",
      signal: abort.signal, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    const json = await res.json() as { error?: string; state?: PushState | null; configured?: boolean; publicKey?: string; categories?: { slug: string; name: string }[] };
    if (!res.ok) throw new PushClientError(json.error ?? (res.status === 503 ? "config" : "network"));
    return json;
  } catch (error) {
    throw error instanceof PushClientError ? error : new PushClientError("network");
  } finally { clearTimeout(timer); }
}

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;
export function ensureReaderServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (registrationPromise) return registrationPromise;
  registrationPromise = (async () => {
    if (!window.isSecureContext || !("serviceWorker" in navigator)) throw new PushClientError("worker");
    await bounded(navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }));
    return bounded(navigator.serviceWorker.ready);
  })().catch((error) => { registrationPromise = null; throw error; });
  return registrationPromise;
}

export async function getBrowserPushSubscription(): Promise<PushSubscription | null> {
  if (!readPushSupport().supported || readPushSupport().needInstall) return null;
  const registration = await bounded(navigator.serviceWorker.getRegistration("/"));
  // Declarative Apple subscriptions can survive removal of the root SW.
  const manager = registration?.pushManager ?? (window as Window & { pushManager?: PushManager }).pushManager;
  return manager ? bounded(manager.getSubscription()) : null;
}
function proof(sub: PushSubscription): PushProof {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new PushClientError("invalid");
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}
function remember(state: PushState | null) {
  writePushMasterEnabled(Boolean(state?.enabled) && !readPushDisablePending());
  if (state) writeStoredPushRubrics(state.categorySlugs);
}
async function action(sub: PushSubscription, kind: PushAction, extra: { revision?: number; categorySlugs?: string[] | null } = {}) {
  const result = await jsonFetch("/api/push/subscribe/", { ...proof(sub), action: kind, ...extra,
    locale: navigator.language.slice(0, 32), userAgent: navigator.userAgent.slice(0, 1024) });
  const state = result.state ?? null;
  remember(state);
  return state;
}
export async function readPushServerState() {
  const sub = await getBrowserPushSubscription();
  if (!sub) return null;
  if (!readPushDisablePending()) return action(sub, "status");
  return serial(async () => {
    let state = await action(sub, "status");
    // A previous explicit opt-out is retried on resume, never an opt-in.
    if (readPushDisablePending()) {
      if (state?.enabled) state = await action(sub, "disable", { revision: state.revision });
      writePushDisablePending(false); remember(state);
    }
    return state;
  });
}
export async function getPushPublicKey(): Promise<string> {
  const response = await jsonFetch("/api/push/vapid/");
  if (!response.publicKey) throw new PushClientError("config");
  return response.publicKey;
}
export async function getPushMenu() {
  const response = await jsonFetch("/api/push/menu/");
  if (!Array.isArray(response.categories)) throw new PushClientError("rubrics");
  return response.categories;
}
export function urlBase64ToUint8Array(value: string): Uint8Array {
  const raw = window.atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

let mutationTail: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => Promise<T>): Promise<T> {
  const pending = mutationTail.then(run, run);
  mutationTail = pending.catch(() => {});
  return pending;
}

export async function subscribeForPush(options?: { categorySlug?: string | null; categorySlugs?: string[] | null })
  : Promise<{ ok: true; state: PushState } | { ok: false; reason: string }> {
  const support = readPushSupport();
  if (!support.supported || support.needInstall) return { ok: false, reason: "invalid" };
  // Must run directly in the user's click stack, before network/SW awaits.
  try {
    const permission = support.permission === "granted" ? Promise.resolve("granted" as const) : Notification.requestPermission();
    if (await permission !== "granted") return { ok: false, reason: Notification.permission === "denied" ? "blocked" : "denied" };
    const state = await serial(async () => {
      const publicKey = await getPushPublicKey();
      const key = urlBase64ToUint8Array(publicKey);
      const reg = await ensureReaderServiceWorker();
      let sub = await bounded(reg.pushManager.getSubscription());
      if (sub?.options.applicationServerKey) {
        const oldKey = new Uint8Array(sub.options.applicationServerKey);
        if (oldKey.length !== key.length || oldKey.some((byte, index) => byte !== key[index])) {
          const oldState = await action(sub, "status");
          if (oldState) await action(sub, "unsubscribe", { revision: oldState.revision });
          if (!(await bounded(sub.unsubscribe()))) throw new PushClientError("worker");
          sub = null;
        }
      }
      sub ??= await bounded(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource }));
      const current = await action(sub, "status");
      const result = await action(sub, "subscribe", { ...(current ? { revision: current.revision } : {}),
        categorySlugs: options?.categorySlugs !== undefined ? options.categorySlugs
          : options?.categorySlug ? [options.categorySlug] : current?.categorySlugs ?? readStoredPushRubrics() });
      if (!result) throw new PushClientError("network");
      writePushDisablePending(false); remember(result);
      window.dispatchEvent(new Event("np-push-subscribed"));
      window.dispatchEvent(new Event("np-push-change"));
      return result;
    });
    return { ok: true, state };
  } catch (error) { return { ok: false, reason: error instanceof PushClientError ? error.code : "network" }; }
}

export async function mutatePush(kind: "preferences" | "disable" | "test", revision: number, categorySlugs?: string[] | null) {
  if (kind === "disable") writePushDisablePending(true);
  return serial(async () => {
    const sub = await getBrowserPushSubscription();
    if (!sub) throw new PushClientError("missing");
    const state = await action(sub, kind, { revision, ...(categorySlugs !== undefined ? { categorySlugs } : {}) });
    if (kind === "disable") { writePushDisablePending(false); remember(state); }
    window.dispatchEvent(new Event("np-push-change"));
    return state;
  });
}
export async function setPushEnabled(enabled: boolean): Promise<boolean> {
  if (enabled) return (await subscribeForPush()).ok;
  writePushDisablePending(true);
  try { const state = await readPushServerState(); return Boolean(state && !state.enabled); } catch { return false; }
}
export async function syncPushCategorySlugs(slugs: string[] | null): Promise<boolean> {
  try { const state = await readPushServerState(); if (!state) return false; await mutatePush("preferences", state.revision, slugs); return true; } catch { return false; }
}
export async function unsubscribePush() {
  await serial(async () => {
    const sub = await getBrowserPushSubscription();
    if (!sub) return;
    const state = await action(sub, "status");
    // Stop server delivery before touching the browser subscription.
    if (state) await action(sub, "unsubscribe", { revision: state.revision });
    await bounded(sub.unsubscribe());
    remember(null);
    window.dispatchEvent(new Event("np-push-change"));
  });
}
export const OPEN_SETTINGS_EVENT = "np-open-settings";
export function openReaderSettings() { window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT)); }
