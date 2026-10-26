import { z } from "zod";

const documentsSchema = z.array(z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/u), title: z.string().min(1).max(300),
  pages: z.number().int().min(1).max(80), text: z.string().min(100).max(400_000),
})).min(1).max(8);

export function cityProcedureDocuments(raw: string | number | undefined) {
  if (typeof raw !== "string") return [];
  try { const parsed = documentsSchema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : []; }
  catch { return []; }
}
