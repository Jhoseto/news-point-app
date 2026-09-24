import type { CameraEntry } from "../types";

/**
 * Hand-checked public camera catalog (LP-05).
 * Prefer original-page links. iframe only where the public page embeds rtsp.me
 * and terms allow linking; never extract hidden RTSP or proxy streams.
 */
export const CAMERA_CATALOG: readonly CameraEntry[] = [
  {
    slug: "sba-omv-plovdiv",
    name: "OMV Пловдив",
    place: "бул. „Мария Луиза“, Пловдив",
    direction: null,
    category: "traffic",
    owner: "СБА",
    sourceUrl: "https://www.sba.bg/cctv",
    access: "link",
    embedUrl: null,
    streamStatus: "unverified",
    lastChecked: "2026-09-24",
    notes: "Публична страница на СБА. Потокът се гледа при източника.",
  },
  {
    slug: "sba-omv-orizovo",
    name: "OMV Оризово",
    place: "Оризово, АМ Тракия",
    direction: null,
    category: "traffic",
    owner: "СБА",
    sourceUrl: "https://www.sba.bg/cctv",
    access: "link",
    embedUrl: null,
    streamStatus: "unverified",
    lastChecked: "2026-09-24",
    notes: "Публична страница на СБА. Потокът се гледа при източника.",
  },
  {
    slug: "plovdiv-vasil-aprilov",
    name: "ул. „Васил Априлов“ 126",
    place: "Пловдив",
    direction: "към центъра",
    category: "city",
    owner: "In-Com / weather-webcam.eu",
    sourceUrl: "https://weather-webcam.eu/izberi-webcam-camera/webcam-from-plovdi-live-kameri-ot-plovdiv-na-jivo/",
    access: "link",
    embedUrl: null,
    streamStatus: "unverified",
    lastChecked: "2026-09-24",
    notes: "Каталогът посочва публичен rtsp.me плейър. Вграждане — след изрично съгласие и тест.",
  },
  {
    slug: "plovdiv-komatevo",
    name: "Коматево",
    place: "Пловдив",
    direction: null,
    category: "city",
    owner: "weather-webcam.eu",
    sourceUrl: "https://weather-webcam.eu/izberi-webcam-camera/webcam-from-plovdi-live-kameri-ot-plovdiv-na-jivo/",
    access: "link",
    embedUrl: null,
    streamStatus: "unverified",
    lastChecked: "2026-09-24",
    notes: null,
  },
  {
    slug: "plovdiv-6-septemvri",
    name: "бул. „6-ти септември“",
    place: "Пловдив",
    direction: null,
    category: "city",
    owner: "weather-webcam.eu",
    sourceUrl: "https://weather-webcam.eu/izberi-webcam-camera/webcam-from-plovdi-live-kameri-ot-plovdiv-na-jivo/",
    access: "link",
    embedUrl: null,
    streamStatus: "unverified",
    lastChecked: "2026-09-24",
    notes: null,
  },
  {
    slug: "plovdiv-trakia",
    name: "кв. „Тракия“",
    place: "Пловдив",
    direction: null,
    category: "city",
    owner: "weather-webcam.eu",
    sourceUrl: "https://weather-webcam.eu/izberi-webcam-camera/webcam-from-plovdi-live-kameri-ot-plovdiv-na-jivo/",
    access: "link",
    embedUrl: null,
    streamStatus: "unverified",
    lastChecked: "2026-09-24",
    notes: "Кандидатът 22trakiq.click2stream.com остава непотвърден и не е вграден.",
  },
  {
    slug: "asenovgrad-panorama",
    name: "Асеновград — панорама",
    place: "Асеновград",
    direction: null,
    category: "region",
    owner: "weather-webcam.eu",
    sourceUrl: "https://weather-webcam.eu/asenovgrad-na-jivo-kamera-na-glaven-pat-plovdiv-smolian/",
    access: "link",
    embedUrl: null,
    streamStatus: "unverified",
    lastChecked: "2026-09-24",
    notes: "Публична страница с rtsp.me. Засега само линк към оригинала.",
  },
  {
    slug: "asenovgrad-ii-86",
    name: "Асеновград — път II-86",
    place: "Асеновград",
    direction: "Пловдив — Смолян",
    category: "region",
    owner: "weather-webcam.eu",
    sourceUrl: "https://weather-webcam.eu/asenovgrad-na-jivo-kamera-na-glaven-pat-plovdiv-smolian/",
    access: "link",
    embedUrl: null,
    streamStatus: "unverified",
    lastChecked: "2026-09-24",
    notes: null,
  },
] as const;

export function getCamera(slug: string): CameraEntry | undefined {
  return CAMERA_CATALOG.find((camera) => camera.slug === slug);
}

export function camerasByCategory(category: CameraEntry["category"] | "all"): CameraEntry[] {
  if (category === "all") return [...CAMERA_CATALOG];
  return CAMERA_CATALOG.filter((camera) => camera.category === category);
}

export function hasVerifiedLiveCamera(): boolean {
  return CAMERA_CATALOG.some((camera) => camera.streamStatus === "verified");
}
