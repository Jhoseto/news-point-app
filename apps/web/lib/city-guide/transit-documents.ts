import { cityProcedureDocuments } from "./procedure-documents";

export function cityTransitDocument(fields: Record<string, string | number>) {
  const { line, title, validFrom, validThrough, dayTypes } = fields;
  const documents = cityProcedureDocuments(fields.documents);
  if (typeof line !== "string" || !/^[1-9]\d{0,2}$/u.test(line) || typeof title !== "string" || !title.trim() || title.length > 300
    || typeof validFrom !== "string" || typeof validThrough !== "string" || validFrom > validThrough
    || ![validFrom, validThrough].every(date => /^20\d{2}-\d{2}-\d{2}$/u.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date)
    || dayTypes !== "Делник / Празник" || documents.length !== 1) return null;
  const document = documents[0]!;
  return { line, title, validFrom, validThrough, dayTypes, hash: document.hash, pages: document.pages };
}

export type TransitDocument = NonNullable<ReturnType<typeof cityTransitDocument>>;
