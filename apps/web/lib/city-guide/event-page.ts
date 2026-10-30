import type { AgendaEvent } from "./event-agenda";

/** Reversible, collisionless identifier shared by server and browser. No raw IDs enter URL paths. */
export function cityEventId(sourceId: string): string {
  const bytes = new TextEncoder().encode(sourceId);
  return `e-${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

export function validCityEventId(value: string): boolean {
  return /^e-[A-Za-z0-9_-]{1,2000}$/.test(value);
}

/** Canonical decoding only: invalid UTF-8 and alternate base64 encodings are not aliases. */
export function decodeCityEventId(value: string): string | null {
  if (!validCityEventId(value)) return null;
  try {
    const encoded = value.slice(2).replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded && cityEventId(decoded) === value ? decoded : null;
  } catch { return null; }
}

export function cityEventPath(sourceId: string): string {
  return `/moyat-plovdiv/events/${cityEventId(sourceId)}/`;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Only explicit dates and addresses support Event markup. Recurring programmes remain WebPages. */
export function cityEventSchema(event: AgendaEvent, url: string): Record<string, unknown> | null {
  if (event.recurrence || !event.title.trim() || !event.place.trim() || !event.address.trim()
    || !validDate(event.date) || !validDate(event.endDate) || event.endDate < event.date) return null;
  return {
    "@type": "Event", "@id": `${url}#event`, url, name: event.title,
    startDate: event.date, endDate: event.endDate,
    ...(event.image?.startsWith("/moyat-plovdiv/event-image/?") ? { image: new URL(event.image, new URL(url).origin).href } : {}),
    ...(event.description ? { description: event.description } : {}),
    ...(["EventScheduled", "EventCancelled", "EventPostponed", "EventRescheduled"].includes(event.status)
      ? { eventStatus: `https://schema.org/${event.status}` } : {}),
    location: { "@type": "Place", name: event.place, address: event.address },
  };
}
