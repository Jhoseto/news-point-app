import type { OutboxEventType, OutboxPayload } from "@newspoint/db/schema";

/**
 * Public live event (master plan 4.4). Only public data: no drafts, internal
 * fields or user data. layoutVersion is the event id, a monotonic version of
 * the public homepage state.
 */
export interface LiveEvent {
  eventId: number;
  type: OutboxEventType;
  entityId: string;
  version: number;
  occurredAt: string;
  layoutVersion: number;
  topics: string[];
  path: string;
  title: string;
  card: LiveCard | null;
}

/** What the "new article" notification shows; null when the article is not public. */
export interface LiveCard {
  category: { name: string; path: string } | null;
  image: { url: string; alt: string } | null;
  publishedAt: string;
}

export interface OutboxRow {
  id: number;
  type: OutboxEventType;
  entityId: string;
  version: number;
  payload: OutboxPayload;
  occurredAt: Date;
}

export function toLiveCard(summary: {
  category: { name: string; path: string } | null;
  hero: { url: string; alt: string } | null;
  publishedAt: Date;
}): LiveCard {
  return {
    category: summary.category ? { name: summary.category.name, path: summary.category.path } : null,
    image: summary.hero ? { url: summary.hero.url, alt: summary.hero.alt } : null,
    publishedAt: summary.publishedAt.toISOString(),
  };
}

export function toLiveEvent(row: OutboxRow, card: LiveCard | null = null): LiveEvent {
  return {
    eventId: row.id,
    type: row.type,
    entityId: row.entityId,
    version: row.version,
    occurredAt: row.occurredAt.toISOString(),
    layoutVersion: row.id,
    topics: row.payload.topics,
    path: row.payload.path,
    title: row.payload.title,
    card,
  };
}

export const LIVE_EVENT_NAME = "article";

export function formatSse(event: LiveEvent): string {
  return `id: ${event.eventId}\nevent: ${LIVE_EVENT_NAME}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Last-Event-ID is client input: accept only a positive safe integer. */
export function parseLastEventId(value: string | null): number | null {
  if (!value || !/^\d{1,15}$/.test(value.trim())) return null;
  const id = Number(value.trim());
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Paths whose cached HTML changes when an article changes. */
export function affectedPaths(event: Pick<LiveEvent, "path">): string[] {
  return [...new Set(["/", event.path])];
}
