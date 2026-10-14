export type SpeechFormat = "opus" | "aac";

export function preferredSpeechFormat(canPlayType: (mime: string) => string): SpeechFormat {
  return canPlayType('audio/webm; codecs="opus"') ? "opus" : "aac";
}

/** Old clients use AAC; reject ambiguous/unbounded codec requests. */
export function parseSpeechFormat(values: readonly string[]): SpeechFormat | null {
  if (!values.length) return "aac";
  return values.length === 1 && (values[0] === "opus" || values[0] === "aac") ? values[0] : null;
}

export function speechEncodingProfile(format: SpeechFormat): string {
  return format === "opus" ? "opus-40-v1" : "aac-64-v1";
}
