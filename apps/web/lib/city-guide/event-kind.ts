/** Only explicit programme wording can place a general event in the night guide. */
export function explicitNightEventKind(fields: Record<string, string | number>): "live" | "standup" | null {
  if (typeof fields.title !== "string") return null;
  if (/(?:stand[\s-]?up|стенд[\s-]?ъп)/iu.test(fields.title)) return "standup";
  if (/(?:\blive\s+(?:at|in)\b|\bconcert\b|концерт|жива музика)/iu.test(fields.title)) return "live";
  return null;
}
