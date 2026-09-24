"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DataEnvelope, TrafficIncidentsPayload } from "@/lib/livepoint/types";
import { formatFull } from "@/lib/format";
import { TrafficMap } from "./traffic-map";

export function TrafficPanel({ connected }: { connected: boolean }) {
  const [incidents, setIncidents] = useState<DataEnvelope<TrafficIncidentsPayload> | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/livepoint/traffic/", { cache: "no-store" });
        const json = (await response.json()) as DataEnvelope<TrafficIncidentsPayload>;
        if (!cancelled) setIncidents(json);
      } catch {
        if (!cancelled) {
          setIncidents({
            source: "tomtom",
            fetchedAt: null,
            expiresAt: null,
            status: "unavailable",
            message: "Инцидентите не са достъпни в момента.",
            payload: null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected]);

  if (!connected) {
    return (
      <div className="py-2">
        <p className="text-base font-semibold text-ink">Картата още се свързва</p>
        <p className="mt-2 text-sm text-body">
          Ще я отворим, когато има потвърден източник за Пловдив. Дотогава не показваме индекс и не правим заявки.
        </p>
        <Link href="/livepoint/traffic/" className="mt-4 inline-flex text-sm font-semibold text-link">
          Отвори страницата за трафик
        </Link>
      </div>
    );
  }

  const list = incidents?.payload?.incidents ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-h-56 overflow-hidden rounded-2xl border border-line bg-surface-2">
        {mapReady ? (
          <TrafficMap className="h-64 w-full lg:h-[20rem]" />
        ) : (
          <button
            type="button"
            className="flex h-64 w-full flex-col items-center justify-center gap-1.5 text-sm font-semibold text-link lg:h-[20rem]"
            onClick={() => setMapReady(true)}
          >
            Зареди картата на Пловдив
            <span className="font-medium text-muted">Картата се изтегля едва сега.</span>
          </button>
        )}
      </div>
      <div>
        <h3 className="text-xs font-bold tracking-[0.12em] text-muted uppercase">Инциденти и ограничения</h3>
        {incidents?.fetchedAt ? (
          <p className="mt-1 text-xs text-muted">Обновено {formatFull(new Date(incidents.fetchedAt))}</p>
        ) : (
          <p className="mt-1 text-xs text-muted">Зареждане…</p>
        )}
        {incidents?.message ? <p className="mt-2 text-sm text-muted">{incidents.message}</p> : null}
        {list.length === 0 && incidents?.status === "ok" ? (
          <p className="mt-3 text-sm text-body">
            Няма регистрирани инциденти от този източник. Това не означава, че по пътищата няма инциденти.
          </p>
        ) : (
          <ul className="np-scroll-soft mt-3 flex max-h-64 flex-col gap-3 overflow-y-auto">
            {list.map((item) => (
              <li key={item.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                <p className="text-xs font-bold tracking-wide text-logo uppercase">{item.categoryLabel}</p>
                <p className="mt-1 text-sm font-semibold text-ink">{item.description}</p>
                {item.from ? <p className="mt-0.5 text-xs text-muted">{item.from}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
