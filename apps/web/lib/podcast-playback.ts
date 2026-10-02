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

/** Display a suggestion without loading audio; an existing listening session wins. */
export function displayedEpisode<T>(current: T | null, suggested: T | null): T | null {
  return current ?? suggested;
}

export function clampPlaybackTime(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(seconds, duration));
}

export function podcastPanelPlace(viewport: number, buttonLeft: number, buttonWidth: number) {
  const width = Math.min(880, Math.max(0, viewport - 24));
  const left = Math.max(12, Math.min(buttonLeft, viewport - width - 12));
  const arrow = Math.max(18, Math.min(width - 18, buttonLeft + buttonWidth / 2 - left));
  return { width, left, arrow };
}
