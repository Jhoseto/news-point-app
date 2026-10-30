import type { SocialStatus } from "@newspoint/content";

export const PODCAST_SOCIAL_POLL_MS = 5000;
export const PODCAST_SOCIAL_POLL_WINDOW_MS = 5 * 60_000;

export function isPodcastSharePending(status: SocialStatus | null): boolean {
  return Boolean(status?.job && ["pending", "working", "sending", "retry"].includes(status.job.status));
}

export function shouldPollPodcastShare(status: SocialStatus | null, startedAt: number, now: number): boolean {
  return isPodcastSharePending(status) && now - startedAt < PODCAST_SOCIAL_POLL_WINDOW_MS;
}

export function podcastFacebookPostUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)facebook\.com$/i.test(url.hostname) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

type ShareControl = { action: "share" | "retry" | "check" | null; label: string; hint: string; busy?: boolean };

/** A failed status request must never turn into another publishing request. */
export function podcastShareControl(input: {
  status: SocialStatus | null;
  loading: boolean;
  submitting: boolean;
  blockedReason?: string | undefined;
  error?: string;
  pollingPaused: boolean;
}): ShareControl {
  const { status, loading, submitting, blockedReason, error, pollingPaused } = input;
  if (submitting) return { action: null, label: "Изпращане…", hint: "Заявката за споделяне се записва.", busy: true };
  if (loading) return { action: null, label: "Проверка…", hint: "Проверява се състоянието във Facebook.", busy: true };
  if (status?.job?.status === "succeeded") return { action: null, label: "Споделено във Facebook", hint: status.job.message };
  if (blockedReason) return { action: null, label: "Сподели във Facebook", hint: blockedReason };
  if (error) return { action: "check", label: "Провери статуса", hint: error };
  if (!status) return { action: "check", label: "Провери статуса", hint: "Състоянието на споделянето не е заредено." };
  if (!status.ready || !status.connected || !status.enabled) return { action: "check", label: "Провери връзката", hint: !status.ready
    ? "Споделянето още не е настроено от администратора."
    : !status.connected ? "Необходима е връзка с Facebook от администратора." : "Споделянето е временно спряно от администратора." };
  if (!status.job) return { action: "share", label: "Сподели във Facebook", hint: "Към свързаните Facebook страници, с линк в първия коментар." };
  if (status.job.status === "failed" && status.job.canRetry) return { action: "retry", label: "Опитай отново", hint: status.job.message };
  if (isPodcastSharePending(status) && !pollingPaused) return { action: null, label: "Изпраща се…", hint: status.job.message, busy: true };
  if (status.job.status === "cancelled") return { action: null, label: "Споделянето е спряно", hint: status.job.message };
  return { action: "check", label: "Провери статуса", hint: pollingPaused
    ? "Заявката още се обработва. Провери статуса, без да изпращаш повторно."
    : status.job.message };
}
