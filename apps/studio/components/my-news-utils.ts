/**
 * Pure helpers for the "Моята новина" Studio desk.
 *
 * The citizen submission payload (kind: "my_news") carries fields like
 * `workingTitle`, `whatHappened`, `whereWhen`, `publishName`, `rightsAck`,
 * `factsAck`, and a `photos[]` array. These helpers normalize that payload
 * and provide the editor's status taxonomy without requiring React.
 */

export const MY_NEWS_STATUSES = ["received", "in_review", "verified", "rejected", "published"] as const;
export type MyNewsStatus = (typeof MY_NEWS_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  received: "Получен",
  in_review: "В проверка",
  verified: "Потвърден",
  rejected: "Отхвърлен",
  published: "Публикуван",
};

export type Tone = "positive" | "info" | "warning" | "negative" | "neutral";

export function statusTone(status: string): Tone {
  switch (status) {
    case "verified":
    case "published":
      return "positive";
    case "in_review":
      return "info";
    case "rejected":
      return "negative";
    default:
      return "neutral";
  }
}

const BG_DATE = new Intl.DateTimeFormat("bg-BG", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Sofia" });
const BG_DATE_LONG = new Intl.DateTimeFormat("bg-BG", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Sofia" });

export function formatDate(iso: string): string {
  return BG_DATE.format(new Date(iso));
}

export function formatDateLong(iso: string): string {
  return BG_DATE_LONG.format(new Date(iso));
}

export interface MyNewsPayload {
  workingTitle: string;
  whatHappened: string;
  whereWhen: string;
  publishName: string;
  rightsAck: boolean;
  factsAck: boolean;
}

export interface MyNewsSubmission {
  id: string;
  status: string;
  payload: Record<string, unknown>;
  contact: string | null;
  createdAt: string;
  articleId: string | null;
  photos: ReadonlyArray<{ path: string }>;
  position: { lat: number; lon: number } | null;
  ipHash: string | null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parsePayload(payload: Record<string, unknown>): MyNewsPayload {
  return {
    workingTitle: asString(payload.workingTitle),
    whatHappened: asString(payload.whatHappened ?? payload.description),
    whereWhen: asString(payload.whereWhen),
    publishName: asString(payload.publishName),
    rightsAck: asBoolean(payload.rightsAck),
    factsAck: asBoolean(payload.factsAck),
  };
}

function asPhotoList(value: unknown): ReadonlyArray<{ path: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { path: string } => Boolean(item) && typeof (item as { path?: unknown }).path === "string");
}

function asPosition(value: unknown): { lat: number; lon: number } | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { lat?: unknown; lon?: unknown };
  if (typeof candidate.lat === "number" && typeof candidate.lon === "number") {
    return { lat: candidate.lat, lon: candidate.lon };
  }
  return null;
}

export function normalizeSubmission(input: {
  id: string;
  status: string;
  payload: Record<string, unknown>;
  contact: string | null;
  createdAt: string;
  articleId: string | null;
}): MyNewsSubmission {
  return {
    id: input.id,
    status: input.status,
    payload: input.payload,
    contact: input.contact,
    createdAt: input.createdAt,
    articleId: input.articleId,
    photos: asPhotoList(input.payload.files),
    ipHash: null,
    position: asPosition(input.payload.position),
  };
}

export function snippet(payload: Record<string, unknown>): string {
  return (asString(payload.workingTitle) || asString(payload.whatHappened) || asString(payload.description)).slice(0, 180);
}

export type Filter = "all" | MyNewsStatus;

export function filterMyNews(items: MyNewsSubmission[], filter: Filter, query: string): MyNewsSubmission[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (filter !== "all" && item.status !== filter) return false;
    if (q) {
      const text = `${item.payload.workingTitle ?? ""} ${item.payload.whatHappened ?? ""} ${item.payload.description ?? ""} ${item.payload.whereWhen ?? ""} ${item.payload.publishName ?? ""} ${item.contact ?? ""}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });
}

export function sortByDate(items: MyNewsSubmission[]): MyNewsSubmission[] {
  return items.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function countByStatus(items: MyNewsSubmission[]): Record<string, number> {
  const counts: Record<string, number> = { all: items.length, withPhotos: 0, withPosition: 0, linkedToArticle: 0 };
  for (const status of MY_NEWS_STATUSES) {
    counts[status] = 0;
  }
  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    if (item.photos.length > 0) counts.withPhotos = (counts.withPhotos ?? 0) + 1;
    if (item.position) counts.withPosition = (counts.withPosition ?? 0) + 1;
    if (item.articleId) counts.linkedToArticle = (counts.linkedToArticle ?? 0) + 1;
  }
  return counts;
}

const VALID_TRANSITIONS: Record<MyNewsStatus, ReadonlyArray<MyNewsStatus>> = {
  received: ["in_review", "verified", "rejected"],
  in_review: ["verified", "rejected", "received"],
  verified: ["in_review", "published", "rejected"],
  published: ["verified"],
  rejected: ["received"],
};

export function nextAllowedStatuses(status: string): MyNewsStatus[] {
  if (MY_NEWS_STATUSES.includes(status as MyNewsStatus)) {
    return [...VALID_TRANSITIONS[status as MyNewsStatus]];
  }
  return [];
}

export function isEditorialUpdateValid(input: { status: string; articleId?: string | null }): boolean {
  if (!MY_NEWS_STATUSES.includes(input.status as MyNewsStatus)) return false;
  if (input.articleId !== undefined && input.articleId !== null) {
    return /^[0-9a-f-]{36}$/i.test(input.articleId);
  }
  return true;
}

export function photoUrl(path: string): string {
  return `/api/editor/submissions/photo/?path=${encodeURIComponent(path)}`;
}