"use client";

import { useEffect, useState } from "react";
import { formatHeaderDay, formatTime } from "@/lib/format";

/** Current date and time in Europe/Sofia; ticks on the minute. */
export function HeaderClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const current = new Date();
      setNow(current);
      timer = setTimeout(schedule, 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds()) + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return (
    <time dateTime={now.toISOString()} className="flex flex-col items-end leading-tight" suppressHydrationWarning>
      <span className="text-[1.0625rem] font-extrabold text-ink tabular-nums" suppressHydrationWarning>
        {formatTime(now)}
      </span>
      <span className="np-clock-day text-xs font-medium whitespace-nowrap text-muted" suppressHydrationWarning>
        {formatHeaderDay(now)}
      </span>
    </time>
  );
}
