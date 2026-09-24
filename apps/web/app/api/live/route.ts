import { formatSse, parseLastEventId, type LiveEvent } from "@/lib/live/events";
import { getLiveHub } from "@/lib/live/hub";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;
const REPLAY_LIMIT = 100;

// Server-Sent Events: public events only, never cached. Browsers reconnect by
// themselves and send Last-Event-ID, so missed events are replayed from the outbox.
export async function GET(request: Request) {
  const lastEventId = parseLastEventId(
    request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("lastEventId"),
  );
  const hub = getLiveHub();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      let sentUpTo = lastEventId ?? hub.currentId;
      let replaying = true;
      const buffered: LiveEvent[] = [];
      const deliver = (event: LiveEvent) => {
        if (event.eventId <= sentUpTo) return;
        send(formatSse(event));
        sentUpTo = event.eventId;
      };
      const unsubscribe = hub.subscribe((event) => (replaying ? buffered.push(event) : deliver(event)));

      send("retry: 3000\n\n");
      if (lastEventId !== null) {
        try {
          for (const event of await hub.since(lastEventId, REPLAY_LIMIT)) deliver(event);
        } catch (error) {
          console.error(`[live] replay failed: ${(error as Error).message}`);
        }
      }
      replaying = false;
      buffered.forEach(deliver);

      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
