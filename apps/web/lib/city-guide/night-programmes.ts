/** Reader allowlist; source identity and location are verified in the collectors. */
export const NIGHT_PROGRAMME_SOURCES = ["bilet-beebop", "bilet-download", "bilet-plovdiv-event-center", "bilet-colodrome", "bilet-elum", "bushido-programme", "plovdiv-live-club-events"];
export function programmeKind(sourceId: string, fields: Record<string, string | number>): "live" | "party" | "standup" | null {
  return NIGHT_PROGRAMME_SOURCES.includes(sourceId) && ["live", "party", "standup"].includes(String(fields.eventKind)) ? fields.eventKind as "live" | "party" | "standup" : null;
}
