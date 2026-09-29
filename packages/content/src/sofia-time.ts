/** Wall-clock time in Bulgaria. Never the machine's own timezone. */
export const SOFIA_TIME_ZONE = "Europe/Sofia";

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

interface Civil {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function sofiaCivil(instant: Date): Civil {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SOFIA_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute") };
}

/** `YYYY-MM-DDTHH:mm` entered as Bulgarian time, as a UTC instant. */
export function sofiaWallToUtc(wall: string): Date | null {
  const match = WALL.exec(wall);
  if (!match) return null;
  const desired: Civil = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  if (desired.month < 1 || desired.month > 12 || desired.day < 1 || desired.day > 31 || desired.hour > 23 || desired.minute > 59) return null;
  let utc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute);
  for (let step = 0; step < 4; step += 1) {
    const shown = sofiaCivil(new Date(utc));
    const shownUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
    const wanted = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute);
    const delta = wanted - shownUtc;
    if (delta === 0) return new Date(utc);
    utc += delta;
  }
  const check = sofiaCivil(new Date(utc));
  return check.year === desired.year && check.month === desired.month && check.day === desired.day && check.hour === desired.hour && check.minute === desired.minute
    ? new Date(utc)
    : null;
}

/** UTC instant shown as Bulgarian `YYYY-MM-DDTHH:mm`. */
export function utcToSofiaWall(instant: Date): string {
  const civil = sofiaCivil(instant);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${civil.year}-${pad(civil.month)}-${pad(civil.day)}T${pad(civil.hour)}:${pad(civil.minute)}`;
}
