/**
 * Pure helpers for the submissions desk. Mirrors the labels used in the page
 * so the editor's wording matches the chip's tone.
 */

export const LABELS: Record<string, string> = {
  received: "Получен",
  in_review: "В проверка",
  verified: "Потвърден",
  rejected: "Отхвърлен",
  published: "Публикуван",
};

export const STATUSES = ["received", "in_review", "verified", "rejected", "published"] as const;
export type SubmissionStatus = (typeof STATUSES)[number];

export const KIND_LABELS: Record<string, string> = { report: "Сигнал", my_news: "Моята новина" };
export type SubmissionKind = "report" | "my_news";

const BG_DATE = new Intl.DateTimeFormat("bg-BG", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Sofia" });

export function formatDate(iso: string): string {
  return BG_DATE.format(new Date(iso));
}

export function snippet(payload: Record<string, unknown>): string {
  return String(payload.description ?? payload.whatHappened ?? payload.workingTitle ?? "—").slice(0, 180);
}

export type Tone = "positive" | "negative" | "info" | "neutral";

export function statusTone(status: string): Tone {
  switch (status) {
    case "verified":
    case "published":
      return "positive";
    case "rejected":
      return "negative";
    case "received":
    case "in_review":
      return "info";
    default:
      return "neutral";
  }
}

export interface Submission {
  id: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  payload: Record<string, unknown>;
  contact: string | null;
  createdAt: string;
  articleId: string | null;
}

export function filterSubmissions(
  items: Submission[],
  filterStatus: string,
  filterKind: string,
  query: string,
): Submission[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (filterStatus !== "all" && item.status !== filterStatus) return false;
    if (filterKind !== "all" && item.kind !== filterKind) return false;
    if (q) {
      const text = JSON.stringify(item.payload).toLowerCase();
      if (!text.includes(q) && !(item.contact ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export function countByStatus(items: Submission[]): Record<string, number> {
  const counts: Record<string, number> = { all: items.length };
  for (const status of STATUSES) {
    counts[status] = items.filter((item) => item.status === status).length;
  }
  counts.reports = items.filter((item) => item.kind === "report").length;
  counts.my_news = items.filter((item) => item.kind === "my_news").length;
  return counts;
}