/** Fixed Plovdiv coordinates (DEC-119). Never derived from IP. */
export const PLOVDIV = {
  name: "Пловдив",
  lat: 42.1354,
  lon: 24.7453,
  altitude: 167,
  timeZone: "Europe/Sofia",
} as const;

/** TomTom Incident Details bbox around Plovdiv (lon,lat pairs). */
export const PLOVDIV_TRAFFIC_BBOX = "24.60,42.05,24.90,42.22";

export const LIVEPOINT_MODULES = ["weather", "traffic", "cameras", "report", "my-news"] as const;
export type LivePointModule = (typeof LIVEPOINT_MODULES)[number];

export function isLivePointModule(value: string | null | undefined): value is LivePointModule {
  return !!value && (LIVEPOINT_MODULES as readonly string[]).includes(value);
}

export const MODULE_PATHS: Record<LivePointModule, string> = {
  weather: "/livepoint/weather/",
  traffic: "/livepoint/traffic/",
  cameras: "/livepoint/cameras/",
  report: "/livepoint/report/",
  "my-news": "/livepoint/my-news/",
};

export const MODULE_LABELS: Record<LivePointModule, string> = {
  weather: "Време",
  traffic: "Трафик",
  cameras: "Камери",
  report: "Подай сигнал",
  "my-news": "Моята новина",
};

/** MET Norway requires a descriptive User-Agent (terms of service). */
export function metUserAgent(): string {
  return process.env.MET_NORWAY_USER_AGENT?.trim() || "NewsPoint/2.0 (https://newspoint.bg; livepoint@newspoint.bg)";
}

export function tomtomApiKey(): string | undefined {
  const key = process.env.TOMTOM_API_KEY?.trim();
  return key || undefined;
}

export function isTomTomConfigured(): boolean {
  return Boolean(tomtomApiKey());
}
