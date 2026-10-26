import { programmeKind } from "./night-programmes";
import type { CityObservation } from "./local-observations";
import { explicitNightEventKind } from "./event-kind";

export const AGENDA_KINDS = { party: "Партита", live: "Музика на живо", standup: "Стендъп", theatre: "Театър", opera: "Опера и балет", exhibition: "Изложби", community: "Срещи и работилници" } as const;
export type AgendaKind = keyof typeof AGENDA_KINDS;
export const AGENDA_EXTRA_FILTERS = { free: "Безплатен вход", student: "Студентски вечери", electronic: "DJ и електронна музика", rap: "Рап и хип-хоп", folk: "Попфолк и балканска музика", quiz: "Куизове", games: "Настолни игри", jazz: "Джаз", rock: "Рок" } as const;
export type AgendaExtra = keyof typeof AGENDA_EXTRA_FILTERS;
/** Only explicit event titles or a published zero price establish these filters. */
export function agendaExtraMatches(event: { title: string; price: number | null }, extra: string): boolean {
  if (extra === "all") return true;
  const title = event.title.replace(/rock bar/giu, "");
  const rules: Record<AgendaExtra, RegExp> = {
    free: /свободен вход|безплатен вход|вход свободен|free entry/iu,
    student: /студент|student/iu,
    electronic: /(?:^|[^\p{L}])dj(?:[^\p{L}]|$)|диджей|електронн.*музик|techno|техно|house|хаус/iu,
    rap: /хип[ -]?хоп|hip[ -]?hop|(?:^|[^\p{L}])(?:рап|rap)(?:[^\p{L}]|$)/iu,
    folk: /поп[ -]?фолк|pop[ -]?folk|балканск.*музик/iu,
    quiz: /куиз|quiz/iu, games: /настолн.*игр|board games/iu,
    jazz: /джаз|jazz/iu, rock: /(?:^|[^\p{L}])(?:рок|rock)(?:[^\p{L}]|$)/iu,
  };
  return extra === "free" && event.price === 0 || !!rules[extra as AgendaExtra]?.test(title);
}
export type AgendaEvent = { id: string; title: string; kind: AgendaKind; date: string; endDate: string; time: string; place: string; address: string; image: string | null; status: string; price: number | null; description?: string; recurrence?: string; doorsTime?: string; performanceTime?: string };
const canonicalPlace = (place: string) => /^Bee Bop Caf[eé]$/iu.test(place) ? "Bee Bop Café" : place;
const day = (date: Date) => date.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
export function cityAgenda(groups: CityObservation[], category: "culture" | "nightlife"): AgendaEvent[] {
  return groups.filter(group => group.status === "observed").flatMap(group => group.items.flatMap(item => {
    const f = item.fields, source = group.sourceId;
    let kind: AgendaKind = programmeKind(source, f) ?? (source === "club-code-upcoming" ? "party" : source === "plovdiv-theatre" ? "theatre" : source === "plovdiv-opera" ? "opera" : source === "plovdiv-gallery-current" ? "exhibition" : explicitNightEventKind(f) ?? "community");
    if ((category === "nightlife") !== ["party", "live", "standup"].includes(kind)) return [];
    let date = String(f.date ?? f.startDate ?? ""), time = String(f.time ?? ""), endDate = String(f.endDate ?? date);
    if (source === "plovdiv-theatre") {
      const match = String(f.dateTime).match(/^(\d{2})-(\d{2})-(\d{4}).*?(\d{2}:\d{2})/u);
      if (!match) return [];
      date = `${match[3]}-${match[2]}-${match[1]}`; time = match[4]!; endDate = date;
    }
    if (source === "club-code-upcoming") {
      if (!Number.isFinite(Date.parse(date)) || !Number.isFinite(Date.parse(endDate))) return [];
      time = new Date(date).toLocaleTimeString("bg-BG", { timeZone: "Europe/Sofia", hour: "2-digit", minute: "2-digit" });
      date = day(new Date(date)); endDate = day(new Date(endDate));
    }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return [];
    const hash = String(f.imageHash ?? "");
    return [{ id: `${source}:${item.key}`, title: String(f.title), kind, date, endDate, time,
      description: String(f.description ?? ""), recurrence: String(f.recurrence ?? ""), doorsTime: String(f.doorsTime ?? ""), performanceTime: String(f.performanceTime ?? ""),
      place: canonicalPlace(String(f.place ?? f.location ?? f.venue ?? (kind === "theatre" ? "Драматичен театър Пловдив" : ""))), address: String(f.address ?? ""),
      status: String(f.status ?? ""), price: typeof f.price === "number" ? f.price : null,
      image: /^[a-f0-9]{64}$/u.test(hash) ? `/api/city-guide/event-image?${new URLSearchParams({ category, sourceId: source, recordKey: item.key, hash })}` : null }];
  })).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title, "bg"));
}

export function agendaPeriodMatches(event: AgendaEvent, period: string, today: string): boolean {
  if (period === "all") return true;
  if (period === "today") return event.date <= today && event.endDate >= today;
  const start = new Date(`${today}T12:00:00Z`);
  if (period === "week") { start.setUTCDate(start.getUTCDate() + 6); return event.date <= start.toISOString().slice(0, 10) && event.endDate >= today; }
  const weekday = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() + (weekday === 0 ? -2 : weekday === 6 ? -1 : (5 - weekday + 7) % 7));
  const friday = start.toISOString().slice(0, 10); start.setUTCDate(start.getUTCDate() + 2);
  return event.date <= start.toISOString().slice(0, 10) && event.endDate >= friday;
}
