import "server-only";
import { isTomTomConfigured, PLOVDIV_TRAFFIC_BBOX, tomtomApiKey } from "../config";
import type { DataEnvelope, TrafficIncident, TrafficIncidentsPayload } from "../types";
import { bulgarianIncidentDescription, bulgarianTrafficPlace } from "./labels";

const POLL_MS = 30 * 60_000;
const INCIDENT_LIMITS = { freeMonthly: 2500, softStopAt: 2200 };

type QuotaState = {
  monthKey: string;
  incidentCalls: number;
};

type IncidentCache = {
  schemaVersion: number;
  fetchedAt: number;
  expiresAt: number;
  payload: TrafficIncidentsPayload;
};

declare global {
  // eslint-disable-next-line no-var
  var __npTomTomQuota: QuotaState | undefined;
  // eslint-disable-next-line no-var
  var __npTomTomIncidents: IncidentCache | undefined;
}

function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function quota(): QuotaState {
  const key = monthKey();
  const current = globalThis.__npTomTomQuota;
  if (!current || current.monthKey !== key) {
    globalThis.__npTomTomQuota = { monthKey: key, incidentCalls: 0 };
  }
  return globalThis.__npTomTomQuota!;
}

export function getTomTomQuota() {
  const state = quota();
  return {
    month: state.monthKey,
    incidentCalls: state.incidentCalls,
    softLimit: INCIDENT_LIMITS.softStopAt,
    hardLimit: INCIDENT_LIMITS.freeMonthly,
    remainingSoft: Math.max(0, INCIDENT_LIMITS.softStopAt - state.incidentCalls),
  };
}

const CATEGORY_LABELS: Record<number, string> = {
  0: "Неизвестно",
  1: "Произшествие",
  2: "Мъгла",
  3: "Опасни условия",
  4: "Дъжд",
  5: "Заледяване",
  6: "Задръстване",
  7: "Затворена лента",
  8: "Затворен път",
  9: "Пътни работи",
  10: "Силен вятър",
  11: "Наводнение",
  14: "Повредено превозно средство",
};

function mapIncident(raw: Record<string, unknown>): TrafficIncident | null {
  const properties = (raw.properties ?? {}) as Record<string, unknown>;
  const id = typeof properties.id === "string" ? properties.id : null;
  if (!id) return null;
  const category = typeof properties.iconCategory === "number" ? properties.iconCategory : 0;
  const events = Array.isArray(properties.events) ? properties.events : [];
  const firstEvent = (events[0] ?? {}) as Record<string, unknown>;
  const sourceDescription =
    (typeof firstEvent.description === "string" && firstEvent.description) ||
    (typeof properties.from === "string" && properties.from) ||
    "Инцидент от TomTom";
  const categoryLabel = CATEGORY_LABELS[category] ?? "Пътно събитие";
  const description = bulgarianIncidentDescription(sourceDescription, categoryLabel);

  let position: { lat: number; lon: number } | null = null;
  let path: { lat: number; lon: number }[] | null = null;
  const geometry = raw.geometry as { type?: string; coordinates?: unknown } | undefined;
  if (geometry?.type === "Point" && Array.isArray(geometry.coordinates)) {
    const [lon, lat] = geometry.coordinates as number[];
    if (typeof lat === "number" && typeof lon === "number") position = { lat, lon };
  } else if (geometry?.type === "LineString" && Array.isArray(geometry.coordinates)) {
    const points = geometry.coordinates.slice(0, 200).flatMap((coordinate) => {
      if (!Array.isArray(coordinate)) return [];
      const [lon, lat] = coordinate;
      return typeof lon === "number" && Number.isFinite(lon) && typeof lat === "number" && Number.isFinite(lat)
        ? [{ lat, lon }] : [];
    });
    if (points.length > 0) position = points[0]!;
    if (points.length > 1) path = points;
  }

  return {
    id,
    category,
    categoryLabel,
    description,
    from: bulgarianTrafficPlace(typeof properties.from === "string" ? properties.from : null),
    to: bulgarianTrafficPlace(typeof properties.to === "string" ? properties.to : null),
    startTime: typeof properties.startTime === "string" ? properties.startTime : null,
    endTime: typeof properties.endTime === "string" ? properties.endTime : null,
    delaySec: typeof properties.delay === "number" ? properties.delay : null,
    position,
    path,
  };
}

export function trafficConnectionStatus(): DataEnvelope<null> {
  if (!isTomTomConfigured()) {
    return {
      source: "tomtom",
      fetchedAt: null,
      expiresAt: null,
      status: "not_connected",
      message: "Картата още се свързва — липсва TomTom ключ.",
      payload: null,
    };
  }
  return {
    source: "tomtom",
    fetchedAt: null,
    expiresAt: null,
    status: "ok",
    message: "TomTom е конфигуриран.",
    payload: null,
  };
}

export async function getTrafficIncidents(options?: { force?: boolean }): Promise<DataEnvelope<TrafficIncidentsPayload>> {
  if (!isTomTomConfigured()) {
    return {
      source: "tomtom/incidentDetails",
      fetchedAt: null,
      expiresAt: null,
      status: "not_connected",
      message: "Трафикът още се свързва. Няма TomTom ключ в средата.",
      payload: null,
    };
  }

  const cached = globalThis.__npTomTomIncidents?.schemaVersion === 5 ? globalThis.__npTomTomIncidents : undefined;
  if (!options?.force && cached && cached.expiresAt > Date.now()) {
    return {
      source: "tomtom/incidentDetails",
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      expiresAt: new Date(cached.expiresAt).toISOString(),
      status: "ok",
      payload: cached.payload,
    };
  }

  const state = quota();
  if (state.incidentCalls >= INCIDENT_LIMITS.softStopAt) {
    if (cached) {
      return {
        source: "tomtom/incidentDetails",
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        expiresAt: new Date(cached.expiresAt).toISOString(),
        status: "stale",
        message: "Достигнат е месечният бюджет за инциденти. Показваме последните данни.",
        payload: cached.payload,
      };
    }
    return {
      source: "tomtom/incidentDetails",
      fetchedAt: null,
      expiresAt: null,
      status: "unavailable",
      message: "Достигнат е месечният бюджет за заявки към TomTom.",
      payload: null,
    };
  }

  const key = tomtomApiKey()!;
  const url = new URL("https://api.tomtom.com/traffic/services/5/incidentDetails");
  url.searchParams.set("key", key);
  url.searchParams.set("bbox", PLOVDIV_TRAFFIC_BBOX);
  url.searchParams.set("fields", "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code},from,to,startTime,endTime,delay}}}");
  // TomTom Incident Details does not support bg-BG; it rejects the entire request with HTTP 400.
  url.searchParams.set("language", "en-GB");
  url.searchParams.set("timeValidityFilter", "present");

  try {
    state.incidentCalls += 1;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      if (cached) {
        return {
          source: "tomtom/incidentDetails",
          fetchedAt: new Date(cached.fetchedAt).toISOString(),
          expiresAt: new Date(cached.expiresAt).toISOString(),
          status: "stale",
          message: "TomTom временно не отговаря. Показваме последните данни.",
          payload: cached.payload,
        };
      }
      return {
        source: "tomtom/incidentDetails",
        fetchedAt: null,
        expiresAt: null,
        status: "unavailable",
        message: "Инцидентите не са достъпни в момента.",
        payload: null,
      };
    }

    const json = (await response.json()) as { incidents?: Record<string, unknown>[] };
    const incidents = (json.incidents ?? []).flatMap((item) => {
      const mapped = mapIncident(item);
      return mapped ? [mapped] : [];
    });
    const fetchedAt = Date.now();
    const payload: TrafficIncidentsPayload = {
      updatedAt: new Date(fetchedAt).toISOString(),
      incidents,
      bbox: PLOVDIV_TRAFFIC_BBOX,
    };
    globalThis.__npTomTomIncidents = {
      schemaVersion: 5,
      fetchedAt,
      expiresAt: fetchedAt + POLL_MS,
      payload,
    };

    return {
      source: "tomtom/incidentDetails",
      fetchedAt: new Date(fetchedAt).toISOString(),
      expiresAt: new Date(fetchedAt + POLL_MS).toISOString(),
      status: "ok",
      payload,
    };
  } catch {
    if (cached) {
      return {
        source: "tomtom/incidentDetails",
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        expiresAt: new Date(cached.expiresAt).toISOString(),
        status: "stale",
        message: "Мрежова грешка. Показваме последните данни.",
        payload: cached.payload,
      };
    }
    return {
      source: "tomtom/incidentDetails",
      fetchedAt: null,
      expiresAt: null,
      status: "unavailable",
      message: "Инцидентите не са достъпни в момента.",
      payload: null,
    };
  }
}

/** Public map key for the browser SDK — same env for local demo; domain lock is TomTom's job. */
export function tomtomBrowserKey(): string | undefined {
  return tomtomApiKey();
}
