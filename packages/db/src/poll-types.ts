import { z } from "zod";

export const pollOption = z.object({ id: z.uuid(), label: z.string().trim().min(1).max(120) }).strict();
export const pollInput = z.object({
  id: z.uuid().optional(), version: z.number().int().nonnegative(),
  question: z.string().trim().min(5).max(220),
  description: z.string().trim().max(300),
  options: z.array(pollOption).min(2).max(6),
  status: z.enum(["draft", "open", "closed", "archived"]),
  featured: z.boolean(),
  startsAt: z.iso.datetime().nullable(), endsAt: z.iso.datetime().nullable(),
}).strict().superRefine((p, ctx) => {
  if (new Set(p.options.map(o => o.id)).size !== p.options.length || new Set(p.options.map(o => o.label.toLocaleLowerCase("bg"))).size !== p.options.length)
    ctx.addIssue({ code: "custom", message: "Отговорите трябва да са различни." });
  if (p.startsAt && p.endsAt && p.endsAt <= p.startsAt) ctx.addIssue({ code: "custom", message: "Краят трябва да е след началото." });
  if (p.featured && (p.status === "draft" || p.status === "archived")) ctx.addIssue({ code: "custom", message: "Чернова/архив не може да е на началната страница." });
});
export const pollCorrection = z.object({ id: z.uuid(), version: z.number().int().positive(), deltas: z.record(z.uuid(), z.number().int().min(-1_000_000).max(1_000_000)) }).strict();
export type PollInput = z.infer<typeof pollInput>;
export type Poll = Omit<PollInput, "id"> & { id: string; adjustments: Record<string, number>; createdAt: string };
export type PublicPoll = Pick<Poll, "id" | "question" | "description" | "startsAt" | "endsAt"> & {
  open: boolean; adjusted: boolean; total: number;
  options: { id: string; label: string; count: number; percent: number }[];
};
export function isPollOpen(p: Pick<Poll, "status" | "startsAt" | "endsAt">, now = Date.now()) {
  return p.status === "open" && (!p.startsAt || Date.parse(p.startsAt) <= now) && (!p.endsAt || Date.parse(p.endsAt) > now);
}
export function pollResult(p: Poll, counts: Record<string, number>, now = Date.now()): PublicPoll {
  const options = p.options.map(o => ({ ...o, count: Math.max(0, (counts[o.id] ?? 0) + (p.adjustments[o.id] ?? 0)), percent: 0 }));
  const total = options.reduce((sum, o) => sum + o.count, 0);
  // Largest remainders: displayed whole percentages always add up to 100.
  if (total) {
    for (const o of options) o.percent = Math.floor(o.count * 100 / total);
    const sorted = [...options].sort((a, b) => (b.count * 100 / total % 1) - (a.count * 100 / total % 1));
    for (let i = 0, left = 100 - options.reduce((s, o) => s + o.percent, 0); i < left; i++) sorted[i]!.percent++;
  }
  return { id: p.id, question: p.question, description: p.description, startsAt: p.startsAt, endsAt: p.endsAt, open: isPollOpen(p, now), adjusted: Object.values(p.adjustments).some(Boolean), options, total };
}
