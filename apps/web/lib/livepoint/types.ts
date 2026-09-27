export type DataStatus = "ok" | "stale" | "unavailable" | "empty" | "not_connected";

export interface DataEnvelope<T> {
  source: string;
  fetchedAt: string | null;
  expiresAt: string | null;
  status: DataStatus;
  message?: string;
  payload: T | null;
}

export interface LatestHeadline {
  id: string;
  path: string;
  title: string;
  publishedAt: string;
}

export interface WeatherInstant {
  time: string;
  temperatureC: number;
  symbolCode: string | null;
  humidityPct: number | null;
  windSpeedMs: number | null;
  windFromDegrees: number | null;
  cloudAreaPct: number | null;
  pressureHpa: number | null;
  precipitationMm: number | null;
}

export interface WeatherHour {
  time: string;
  temperatureC: number;
  symbolCode: string | null;
  precipitationMm: number | null;
}

export interface WeatherDay {
  date: string;
  symbolCode: string | null;
  tempMinC: number;
  tempMaxC: number;
  precipitationMm: number | null;
}

export interface WeatherForecast {
  place: string;
  updatedAt: string;
  current: WeatherInstant;
  hours: WeatherHour[];
  days: WeatherDay[];
}

export interface TrafficIncident {
  id: string;
  category: number;
  categoryLabel: string;
  description: string;
  from: string | null;
  to: string | null;
  startTime: string | null;
  endTime: string | null;
  delaySec: number | null;
  position: { lat: number; lon: number } | null;
  path: { lat: number; lon: number }[] | null;
}

export interface TrafficIncidentsPayload {
  updatedAt: string;
  incidents: TrafficIncident[];
  bbox: string;
}

export type CameraCategory = "traffic" | "city" | "region";
export type CameraAccess = "link" | "iframe";
export type CameraStreamStatus = "verified" | "unverified" | "unavailable";

export interface CameraEntry {
  slug: string;
  name: string;
  place: string;
  direction: string | null;
  category: CameraCategory;
  owner: string;
  sourceUrl: string;
  access: CameraAccess;
  embedUrl: string | null;
  streamStatus: CameraStreamStatus;
  lastChecked: string;
  notes: string | null;
}
