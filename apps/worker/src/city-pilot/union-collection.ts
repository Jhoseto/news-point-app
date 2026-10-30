import { parseUnionIntercity } from "./union-intercity";
import type { PilotSnapshot } from "./parse";

const routes = {
  "union-plovdiv-burgas": { sourceId: "union-plovdiv-burgas", destination: "Бургас", destinationId: "23" },
  "union-plovdiv-varna": { sourceId: "union-plovdiv-varna", destination: "Варна", destinationId: "29" },
} as const;
export const UNION_TIMETABLE_URL = "https://union-ivkoni.com/bg/routes";
export function unionIntercityRoute(sourceId: string) {
  return Object.hasOwn(routes, sourceId) ? routes[sourceId as keyof typeof routes] : null;
}

export function unionServiceDates(now: number): [string, string] {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return [today, tomorrow];
}

export function unionSearchBody(sourceId: string, serviceDate: string): URLSearchParams {
  const route = unionIntercityRoute(sourceId);
  const date = new Date(`${serviceDate}T12:00:00Z`);
  if (!route || !/^20\d{2}-\d{2}-\d{2}$/u.test(serviceDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== serviceDate) throw new Error("Union: invalid public timetable request");
  const [year, month, day] = serviceDate.split("-");
  return new URLSearchParams({ type: "1", from: "128", to: route.destinationId, sdate: `${day}-${month}-${year}`, rdate: "", adults: "1" });
}

export async function collectUnionIntercity(firstHtml: string, sourceId: string, now: number, readDay: (date: string) => Promise<string>): Promise<PilotSnapshot> {
  const route = unionIntercityRoute(sourceId);
  if (!route) throw new Error("Union: unsupported route");
  const dates = unionServiceDates(now);
  const first = parseUnionIntercity(firstHtml, route, dates[0]);
  const second = parseUnionIntercity(await readDay(dates[1]), route, dates[1]);
  return { ...first, items: [...first.items, ...second.items], completeness: "uncertain",
    limitations: [...new Set([...first.limitations, ...second.limitations, "Only the explicitly requested current and next Sofia service dates are collected. This is not complete intercity coverage."])] };
}
