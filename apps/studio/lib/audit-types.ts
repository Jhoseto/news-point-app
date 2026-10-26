export const AUDIT_AREAS = {
  city: "Моят Пловдив",
  breaking: "Извънредно",
  social: "Социални мрежи",
  articles: "Материали", arrangements: "Подреждане", media: "Медия", stories: "Теми",
  polls: "Анкети", podcasts: "Подкасти", users: "Служители", profile: "Профил",
  submissions: "Читателски материали", auth: "Вход и сигурност", navigation: "Екрани", logs: "Logs",
} as const;
export type AuditArea = keyof typeof AUDIT_AREAS;
export type AuditOutcome = "pending" | "success" | "failure" | "access";
export const AUDIT_OUTCOMES: Record<AuditOutcome, string> = { pending: "В процес / непотвърден", success: "Успешно", failure: "Отказ / грешка", access: "Отваряне на екран" };
export const AUDIT_OUTCOME_FILTERS = Object.fromEntries(Object.entries(AUDIT_OUTCOMES).filter(([outcome]) => outcome !== "access")) as Omit<typeof AUDIT_OUTCOMES, "access">;
export type AuditValue = string | number | boolean | null | AuditValue[] | { [key: string]: AuditValue };
export type AuditDetails = Record<string, AuditValue>;
export interface AuditEntry {
  id: string; startedAt: string; occurredAt: string;
  actorId: string | null; actorName: string; actorEmail: string; actorRole: "editor" | "admin" | "master_admin" | null;
  area: AuditArea; action: string; actionLabel: string;
  entityKind: string; entityId: string; entityLabel: string; targetPath: string | null;
  outcome: AuditOutcome; method: string; path: string; statusCode: number | null; durationMs: number | null;
  ip: string; userAgent: string; details: AuditDetails; searchText: string;
}
export interface AuditFilters {
  q: string; actor: string; area: string; action: string; outcome: string; role: string;
  period: "today" | "yesterday" | "7d" | "30d" | "all" | "custom";
  from: string; to: string; sort: "newest" | "oldest" | "actor" | "action" | "entity" | "outcome" | "duration";
  page: number; size: number; anchor: string;
}
export interface AuditView {
  ready: boolean; buffered: number; rows: AuditEntry[]; total: number; page: number; pages: number;
  filters: AuditFilters;
  actors: { id: string; name: string; email: string }[];
  actions: { value: string; label: string }[];
}
