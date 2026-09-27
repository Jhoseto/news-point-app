import "server-only";
import { getDb, livepointSubmissions } from "@newspoint/db";
import type { MyNewsInput, ReportInput } from "./schema";
import type { SubmissionPhoto } from "./photos";

export type SubmissionResult =
  | { ok: true; id: string; reference: string }
  | { ok: false; error: string; code: "validation" | "storage" | "unavailable" };

function referenceCode(id: string, kind: "report" | "my_news"): string {
  const prefix = kind === "report" ? "NP-S" : "NP-N";
  return `${prefix}-${id.slice(0, 8).toUpperCase()}`;
}

export async function saveReport(input: ReportInput, meta: { ipHash: string | null; userAgent: string | null }, photos: SubmissionPhoto[] = []): Promise<SubmissionResult> {
  try {
    const [row] = await getDb()
      .insert(livepointSubmissions)
      .values({
        kind: "report",
        status: "received",
        payload: {
          kind: input.kind,
          place: input.place,
          position: input.position,
          description: input.description,
          contact: input.contact,
          files: photos,
        },
        contact: input.contact,
        ipHash: meta.ipHash,
        userAgent: meta.userAgent,
      })
      .returning({ id: livepointSubmissions.id });

    if (!row) return { ok: false, error: "Записът не беше създаден.", code: "storage" };
    return { ok: true, id: row.id, reference: referenceCode(row.id, "report") };
  } catch {
    return {
      ok: false,
      error: "Формата още не може да запише сигнала. Миграцията за заявки вероятно не е пусната.",
      code: "unavailable",
    };
  }
}

export async function saveMyNews(input: MyNewsInput, meta: { ipHash: string | null; userAgent: string | null }, photos: SubmissionPhoto[] = []): Promise<SubmissionResult> {
  try {
    const [row] = await getDb()
      .insert(livepointSubmissions)
      .values({
        kind: "my_news",
        status: "received",
        payload: {
          workingTitle: input.workingTitle,
          whatHappened: input.whatHappened,
          whereWhen: input.whereWhen,
          publishName: input.publishName,
          contact: input.contact,
          files: photos,
        },
        contact: input.contact,
        ipHash: meta.ipHash,
        userAgent: meta.userAgent,
      })
      .returning({ id: livepointSubmissions.id });

    if (!row) return { ok: false, error: "Записът не беше създаден.", code: "storage" };
    return { ok: true, id: row.id, reference: referenceCode(row.id, "my_news") };
  } catch {
    return {
      ok: false,
      error: "Формата още не може да запише материала. Миграцията за заявки вероятно не е пусната.",
      code: "unavailable",
    };
  }
}
