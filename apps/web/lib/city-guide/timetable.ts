import { z } from "zod";
const schema = z.array(z.object({
  id: z.string().min(1).max(64), destination: z.string().min(1).max(300),
  stops: z.array(z.object({ id: z.string().min(1).max(64), name: z.string().min(1).max(300), code: z.string().max(64), times: z.array(z.string().regex(/^(?:[0-3]\d|4[0-7]):[0-5]\d:[0-5]\d$/u)).max(2000) })).min(2).max(120),
})).min(1).max(20);
export type CityTimetable = z.infer<typeof schema>;
export function cityTimetable(raw: string | number | undefined): CityTimetable | null {
  if (typeof raw !== "string") return null;
  try { const parsed = schema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : null; } catch { return null; }
}
export function departureLabel(time: string): string {
  const hour = Number(time.slice(0, 2));
  const minuteAndSecond = time.slice(3).replace(/:00$/u, "");
  return `${String(hour % 24).padStart(2, "0")}:${minuteAndSecond}${hour >= 24 ? " (+1 ден)" : ""}`;
}
