import "server-only";
import { asc, gt, max } from "drizzle-orm";
import { triggerRevalidate } from "@newspoint/content";
import { getDb, listen, OUTBOX_CHANNEL, outboxEvents } from "@newspoint/db";
import { getSummariesByIds } from "../queries";
import { affectedPaths, toLiveCard, toLiveEvent, type LiveEvent } from "./events";
import { isPushConfigured, notifyArticlePublished } from "../push";

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
  private pumpPending = false;

  get currentId() {
    return this.lastId;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.ensureStarted();
    return () => this.listeners.delete(listener);
  }

  /** Dev-only: push a synthetic event to open SSE clients without touching the outbox. */
  broadcastSynthetic(event: LiveEvent) {
    for (const listener of this.listeners) listener(event);
  }

  async since(afterId: number, limit = BATCH): Promise<LiveEvent[]> {
    const rows = await getDb()
      .select()
      .from(outboxEvents)
      .where(gt(outboxEvents.id, afterId))
      .orderBy(asc(outboxEvents.id))
      .limit(limit);
    const publishedIds = rows.flatMap((row) => row.type === "article.published" && row.entityId ? [row.entityId] : []);
    const summaries = await getSummariesByIds([...new Set(publishedIds)]);
    return rows.map((row) => {
      const summary = row.type === "article.published" && row.entityId ? summaries.get(row.entityId) : undefined;
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
    // `pumpPending` is cleared at the END of pump(). Setting it at the start
    // (instead of in the .then() body) avoids a race where two microtasks
    // would both read the same `lastId` and deliver the same article twice.
    if (this.pumpPending) return;
    this.pumpPending = true;
    this.pumping = this.pumping.then(async () => {
      try {
        await this.pump();
      } catch (error) {
        console.error(`[live] delivery failed: ${(error as Error).message}`);
      } finally {
        this.pumpPending = false;
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
        if (event.type === "article.published" && isPushConfigured() && event.entityId) {
          notifyArticlePublished(event.entityId).catch((error: unknown) => {
            console.warn(`[push] notify failed: ${(error as Error).message}`);
          });
        }
        for (const listener of this.listeners) listener(event);
      }
      if (events.length < BATCH) return;
    }
  }
}

let warnedNoSecret = false;

async function revalidate(events: LiveEvent[]) {
  const paths = [...new Set(events.flatMap(affectedPaths))].slice(0, 20);
  const result = await triggerRevalidate(paths);
  if (result.reason === "no_secret") {
    if (!warnedNoSecret) console.warn("[live] REVALIDATE_SECRET is not set; cached pages refresh on their own schedule");
    warnedNoSecret = true;
  } else if (result.reason === "error") {
    console.warn("[live] revalidate failed; pages will refresh on the next ISR tick");
  }
}

const globalForHub = globalThis as typeof globalThis & { __npLiveHub?: LiveHub };

export function getLiveHub(): LiveHub {
  globalForHub.__npLiveHub ??= new LiveHub();
  return globalForHub.__npLiveHub;
}
