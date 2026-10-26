import { AGENDA_EXTRA_FILTERS, AGENDA_KINDS, type AgendaKind } from "./event-agenda";
export function agendaDays(today: string) {
  return Array.from({ length: 7 }, (_, index) => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + index); return date.toISOString().slice(0, 10); });
}
export function agendaPreferences(raw: string | null, today: string, places: string[]) {
  const fallback = { kind: "all" as AgendaKind | "all", period: "all", query: "", place: "all", extra: "all", day: "" };
  try {
    const state: unknown = JSON.parse(raw ?? "null");
    if (!state || typeof state !== "object" || Array.isArray(state)) return fallback;
    const value = state as Record<string, unknown>;
    return {
      kind: typeof value.kind === "string" && Object.hasOwn(AGENDA_KINDS, value.kind) ? value.kind as AgendaKind : "all" as const,
      period: typeof value.period === "string" && ["all", "today", "week", "weekend"].includes(value.period) ? value.period : "all",
      query: typeof value.query === "string" ? value.query.slice(0, 150) : "",
      place: typeof value.place === "string" && places.includes(value.place) ? value.place : "all",
      extra: typeof value.extra === "string" && Object.hasOwn(AGENDA_EXTRA_FILTERS, value.extra) ? value.extra : "all",
      day: typeof value.day === "string" && agendaDays(today).includes(value.day) ? value.day : "",
    };
  } catch { return fallback; }
}
