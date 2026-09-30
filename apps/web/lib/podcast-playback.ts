/** m:ss, or h:mm:ss once an episode passes an hour. */
export function playbackClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(rest).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

export function adjacentEpisode<T extends { id: string }>(list: T[], id: string | null, direction: 1 | -1): T | null {
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return direction === 1 ? list[0] ?? null : null;
  return list[index + direction] ?? null;
}

/** 0–1 position on the seek bar. A missing duration stays at the start. */
export function seekRatio(offsetX: number, width: number): number {
  if (!Number.isFinite(offsetX) || !Number.isFinite(width) || width <= 0) return 0;
  return Math.min(1, Math.max(0, offsetX / width));
}
