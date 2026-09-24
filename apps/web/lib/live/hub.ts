import "server-only";
import { asc, gt, max } from "drizzle-orm";
import { getDb, listen, OUTBOX_CHANNEL, outboxEvents } from "@newspoint/db";
import { getSummariesByIds } from "../queries";
import { affectedPaths, toLiveCard, toLiveEvent, type LiveEvent } from "./events";

type Listener = (event: LiveEvent) => void;

const POLL_MS = 10_000;
const RETRY_START_MS = 30_000;
const BATCH = 100;

/**
 * One per web process: reads the outbox after NOTIFY (polling as a fallback),
 * marks the affected pages stale, then broadcasts to open SSE connections.
 * The order matters: a browser refreshing on the event must get fresh HTML.
 */
class LiveHub {
  private readonly listeners = new Set<Listener>();
  private lastId = 0;
  private starting: Promise<void> | null = null;
  private failedAt = 0;
  private pumping: Promise<void> = Promise.resolve();
  private pending = false;

  get currentId() {
    return this.lastId;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.ensureStarted();
    return () => this.listeners.delete(listener);
  }

  async since(afterId: number, limit = BATCH): Promise<LiveEvent[]> {
    const rows = await getDb()
      .select()
      .from(outboxEvents)
      .where(gt(outboxEvents.id, afterId))
      .orderBy(asc(outboxEvents.id))
      .limit(limit);
    const publishedIds = rows.filter((row) => row.type === "article.published").map((row) => row.entityId);
    const summaries = await getSummariesByIds([...new Set(publishedIds)]);
    return rows.map((row) => {
      const summary = row.type === "article.published" ? summaries.get(row.entityId) : undefined;
      return toLiveEvent(row, summary ? toLiveCard(summary) : null);
    });
  }

  private ensureStarted(): Promise<void> {
    if (this.starting) return this.starting;
    if (Date.now() - this.failedAt < RETRY_START_MS) return Promise.resolve();
    this.starting = this.start().catch((error: unknown) => {
      console.error(`[live] not started: ${(error as Error).message}`);
      this.failedAt = Date.now();
      this.starting = null;
    });
    return this.starting;
  }

  private async start() {
    const [row] = await getDb().select({ latest: max(outboxEvents.id) }).from(outboxEvents);
    this.lastId = row?.latest ?? 0;
    await listen(OUTBOX_CHANNEL, () => this.schedule(), () => this.schedule());
    setInterval(() => this.schedule(), POLL_MS).unref();
    console.log(`[live] listening on ${OUTBOX_CHANNEL} from event ${this.lastId}`);
  }

  private schedule() {
    if (this.pending) return;
    this.pending = true;
    this.pumping = this.pumping.then(async () => {
      this.pending = false;
      try {
        await this.pump();
      } catch (error) {
        console.error(`[live] delivery failed: ${(error as Error).message}`);
      }
    });
  }

  private async pump() {
    for (;;) {
      const events = await this.since(this.lastId);
      if (!events.length) return;
      await revalidate(events);
      for (const event of events) {
        this.lastId = event.eventId;
        for (const listener of this.listeners) listener(event);
      }
      if (events.length < BATCH) return;
    }
  }
}

let warnedNoSecret = false;

async function revalidate(events: LiveEvent[]) {
  const secret = process.env.REVALIDATE_SECRET;
  const baseUrl = process.env.WEB_URL ?? "http://localhost:3000";
  if (!secret) {
    if (!warnedNoSecret) console.warn("[live] REVALIDATE_SECRET is not set; cached pages refresh on their own schedule");
    warnedNoSecret = true;
    return;
  }
  const paths = [...new Set(events.flatMap(affectedPaths))].slice(0, 20);
  const response = await fetch(new URL("/api/revalidate/", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", "x-revalidate-secret": secret },
    body: JSON.stringify({ paths }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`revalidate returned ${response.status}`);
}

const globalForHub = globalThis as typeof globalThis & { __npLiveHub?: LiveHub };

export function getLiveHub(): LiveHub {
  globalForHub.__npLiveHub ??= new LiveHub();
  return globalForHub.__npLiveHub;
}
