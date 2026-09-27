import { formatTimelineDayHeading } from "@/lib/format";

/** Separates timeline rows by calendar day (Sofia). */
export function TimelineDayBreak({ date }: { date: Date }) {
  const label = formatTimelineDayHeading(date);
  return (
    <li className="relative list-none pl-16" aria-label={label}>
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-[0.625rem] font-bold tracking-[0.08em] text-muted uppercase tabular-nums">{label}</span>
        <span className="h-px min-w-0 flex-1 bg-line" aria-hidden="true" />
      </div>
    </li>
  );
}
