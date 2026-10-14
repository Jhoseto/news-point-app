export type PodcastAudioExtension = "mp3" | "m4a";
export const PODCAST_AUDIO_MAX_BYTES = 80 * 1024 * 1024;
export const PODCAST_AUDIO_ACCEPT = "audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/flac,.mp3,.m4a,.wav,.flac";

export function podcastAudioExtension(key: string): PodcastAudioExtension | null {
  return /^podcasts\/[0-9]{4}\/[0-9]{2}\/[0-9a-f-]+\.(mp3|m4a)$/.exec(key)?.[1] as PodcastAudioExtension | undefined ?? null;
}

export function podcastAudioMime(extension: PodcastAudioExtension): "audio/mp4" | "audio/mpeg" {
  return extension === "m4a" ? "audio/mp4" : "audio/mpeg";
}
