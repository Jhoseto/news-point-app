import type { TrafficIncident } from "@/lib/livepoint/types";

function formatDelay(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? "мин." : "мин."} забавяне`;
}

export function TrafficIncidentHoverCard({ incident }: { incident: Pick<TrafficIncident, "categoryLabel" | "description" | "from" | "to" | "delaySec"> }) {
  const route = [incident.from, incident.to].filter(Boolean).join(" → ");
  const delay = formatDelay(incident.delaySec);
  return (
    <div className="pointer-events-none max-w-[15.5rem] rounded-xl border border-line/80 bg-surface/95 px-3 py-2.5 shadow-[0_8px_28px_rgb(10_20_84_/_0.12)] backdrop-blur-md">
      <p className="text-[10px] font-extrabold tracking-[0.12em] text-logo uppercase">{incident.categoryLabel}</p>
      <p className="mt-1 line-clamp-3 text-xs font-bold leading-snug text-ink">{incident.description}</p>
      {route ? <p className="mt-1 truncate text-[11px] text-muted">{route}</p> : null}
      {delay ? <p className="mt-1 text-[11px] font-semibold text-body">{delay}</p> : null}
    </div>
  );
}
