import { z } from "zod";
import { cityIntercityRoute, CITY_INTERCITY_ROUTES } from "@newspoint/content/city-intercity";

const date = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/u).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const name = z.string().trim().min(1).max(300);
const journeySchema = z.object({
  date, time, arrivalDate: date, arrivalTime: time,
  origin: z.literal("Пловдив"), destination: z.enum(["София", "Бургас", "Варна"]),
  departureStation: name, arrivalStation: name,
  publisher: z.enum(["Карат-С / Citylines", "Юнион Ивкони"]),
}).refine(value => `${value.arrivalDate}T${value.arrivalTime}` > `${value.date}T${value.time}`)
  .refine(value => Date.parse(`${value.arrivalDate}T${value.arrivalTime}:00Z`) - Date.parse(`${value.date}T${value.time}:00Z`) <= 24 * 60 * 60 * 1000);

export type IntercityJourney = z.infer<typeof journeySchema>;
export function cityIntercityJourney(fields: Record<string, string | number>, sourceId?: string): IntercityJourney | null {
  const result = journeySchema.safeParse(fields);
  if (!result.success) return null;
  const routes = sourceId ? [cityIntercityRoute(sourceId)] : Object.values(CITY_INTERCITY_ROUTES);
  return routes.some(route => route?.destination === result.data.destination && route.publisher === result.data.publisher) ? result.data : null;
}
export function cityIntercityJourneyRelevant(fields: Record<string, string | number>, today: string, sourceId?: string): boolean {
  const journey = cityIntercityJourney(fields, sourceId);
  return !!journey && journey.date >= today
    && Date.parse(`${journey.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`) <= 7 * 86_400_000;
}

export const transportDateLabel = (value: string) => new Intl.DateTimeFormat("bg-BG", {
  day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Sofia",
}).format(new Date(`${value}T12:00:00Z`));

export type IntercitySourceView = {
  sourceId: string; destination: string; publisher: string; checkedAt: string | null;
  status: "observed" | "unavailable" | "stale";
  journeys: (IntercityJourney & { key: string })[];
};

/** Keep each source's freshness and empty state instead of stamping an aggregate as fresh. */
export function cityIntercitySources(groups: { sourceId: string; checkedAt: string; status: IntercitySourceView["status"]; items: { key: string; fields: Record<string, string | number> }[] }[]): IntercitySourceView[] {
  return Object.entries(CITY_INTERCITY_ROUTES).map(([sourceId, route]) => {
    const group = groups.find(group => group.sourceId === sourceId);
    return { sourceId, ...route, checkedAt: group?.checkedAt ?? null, status: group?.status ?? "unavailable",
      journeys: group?.status === "observed" ? group.items.flatMap(item => {
        const journey = cityIntercityJourney(item.fields, sourceId);
        return journey ? [{ ...journey, key: `${sourceId}:${item.key}` }] : [];
      }) : [] };
  });
}
