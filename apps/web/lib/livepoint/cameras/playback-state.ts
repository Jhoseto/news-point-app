/** An external iframe loading does not prove its video is playing. */
export type CameraPlaybackState = "loading" | "ready" | "playing" | "stalled" | "unavailable";

export function isCameraSnapshot(url: string): boolean {
  return /\.jpe?g(?:\?|$)/i.test(url);
}
