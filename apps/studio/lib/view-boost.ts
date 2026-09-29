export const VIEW_UNITS = ["seconds", "minutes", "hours"] as const;
export type ViewUnit = (typeof VIEW_UNITS)[number];

export function intervalToSeconds(amount: number | null, unit: ViewUnit): number | null {
  if (amount == null || amount <= 0) return null;
  const factor = unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1;
  return amount * factor;
}

export function splitInterval(seconds: number | null): { amount: number | null; unit: ViewUnit } {
  if (seconds == null || seconds <= 0) return { amount: null, unit: "minutes" };
  if (seconds % 3600 === 0) return { amount: seconds / 3600, unit: "hours" };
  if (seconds % 60 === 0) return { amount: seconds / 60, unit: "minutes" };
  return { amount: seconds, unit: "seconds" };
}

/** Added views needed so real + added equals the publish number. Real views are never hidden. */
export function artificialForSeed(seed: number, real: number): number {
  return Math.max(0, seed - Math.max(0, real));
}

export function boostSteps(elapsedSeconds: number, intervalSeconds: number, room: number): number {
  if (intervalSeconds <= 0 || room <= 0) return 0;
  return Math.min(room, Math.max(1, Math.floor(elapsedSeconds / intervalSeconds) + 1));
}
