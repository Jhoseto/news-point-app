export const CITY_SAVED_KEY = "np:city:saved:v1";
export const CITY_SAVED_CHANGE = "np:city:saved-change";
export function eventSaveKey(category: string, id: string) { return `${category}|${id}`; }
export function parseSavedEvents(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && /^(culture|nightlife)\|[^\s]{1,600}$/u.test(entry)))].slice(0, 100) : [];
  } catch { return []; }
}
export function toggleSavedEvent(saved: string[], key: string): string[] {
  return saved.includes(key) ? saved.filter(entry => entry !== key) : parseSavedEvents(JSON.stringify([key, ...saved])).slice(0, 100);
}
