"use client";

/** Shared Web Push helpers for settings, category follow and desktop prompt. */

export type PushSupport = {
  supported: boolean;
  needInstall: boolean;
  permission: NotificationPermission | "unsupported";
};

function detectIosSafariStandalone(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isWebkit = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && isWebkit && standalone;
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function readPushSupport(): PushSupport {
  if (typeof window === "undefined") {
    return { supported: false, needInstall: false, permission: "unsupported" };
  }
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return { supported: false, needInstall: false, permission: "unsupported" };
  const needInstall = !detectIosSafariStandalone() && isIosDevice();
  return { supported: true, needInstall, permission: Notification.permission };
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushUpsertBody = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  categorySlug?: string | null;
  categorySlugs?: string[] | null;
  enabled?: boolean;
  locale?: string;
  userAgent?: string;
};

export async function getBrowserPushSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function upsertPushOnServer(body: PushUpsertBody): Promise<boolean> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      locale: body.locale ?? navigator.language,
      userAgent: body.userAgent ?? navigator.userAgent,
    }),
  });
  return res.ok;
}

export async function subscribeForPush(options?: {
  categorySlug?: string | null;
  categorySlugs?: string[] | null;
}): Promise<{ ok: true } | { ok: false; reason: "denied" | "blocked" | "config" | "invalid" | "network" }> {
  const support = readPushSupport();
  if (!support.supported || support.needInstall) return { ok: false, reason: "invalid" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: permission === "denied" ? "blocked" : "denied" };
  }
  const reg = await navigator.serviceWorker.ready;
  const vapidRes = await fetch("/api/push/vapid", { cache: "no-store" });
  if (!vapidRes.ok) return { ok: false, reason: "config" };
  const { publicKey } = (await vapidRes.json()) as { publicKey: string };
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { ok: false, reason: "invalid" };
  const ok = await upsertPushOnServer({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    categorySlug: options?.categorySlug ?? null,
    categorySlugs: options?.categorySlugs ?? null,
    enabled: true,
  });
  return ok ? { ok: true } : { ok: false, reason: "network" };
}

export async function setPushEnabled(enabled: boolean): Promise<boolean> {
  const sub = await getBrowserPushSubscription();
  if (!sub) return false;
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  return upsertPushOnServer({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    enabled,
  });
}

export async function syncPushCategorySlugs(categorySlugs: string[] | null): Promise<boolean> {
  const sub = await getBrowserPushSubscription();
  if (!sub) return false;
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  return upsertPushOnServer({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    categorySlugs,
    categorySlug: null,
    enabled: true,
  });
}

export async function unsubscribePush(): Promise<void> {
  const sub = await getBrowserPushSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { method: "DELETE" });
}

export const OPEN_SETTINGS_EVENT = "np-open-settings";

export function openReaderSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}
