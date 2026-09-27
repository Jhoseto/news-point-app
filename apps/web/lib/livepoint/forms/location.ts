import { z } from "zod";

export const reportPositionSchema = z.object({
  lat: z.number().min(-85.0511).max(85.0511),
  lon: z.number().min(-180).max(180),
});

export type ReportPosition = z.infer<typeof reportPositionSchema>;
export type ReportLocation = { place: string; position: ReportPosition };

export function coordinateLabel(point: ReportPosition): string {
  return `Точка на картата: ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
}

export function geolocationErrorMessage(code: number): string {
  if (code === 1) return "Достъпът до местоположението е отказан. Разрешете го в браузъра или посочете точка на картата.";
  if (code === 3) return "Устройството не намери местоположението навреме. Опитайте отново или посочете точката ръчно.";
  return "Местоположението не е достъпно. Проверете настройките на устройството или посочете точката ръчно.";
}

/** One explicit request; no background tracking. The caller supplies the browser service. */
export function requestDeviceLocation(geolocation: Pick<Geolocation, "getCurrentPosition">): Promise<{ point: ReportPosition; accuracy: number | null }> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(position => {
      const parsed = reportPositionSchema.safeParse({ lat: position.coords.latitude, lon: position.coords.longitude });
      if (!parsed.success) { reject(new Error("Това местоположение е извън обхвата на картата. Посочете точката ръчно.")); return; }
      resolve({ point: parsed.data, accuracy: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null });
    }, error => reject(new Error(geolocationErrorMessage(error.code))), { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 });
  });
}
