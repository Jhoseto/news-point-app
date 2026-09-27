import { z } from "zod";
import { reportContactSchema } from "./contact";
import { reportPositionSchema } from "./location";

export const reportKinds = ["road", "city", "other"] as const;
export type ReportKind = (typeof reportKinds)[number];

export const reportSchema = z.object({
  kind: z.enum(reportKinds),
  place: z.string().trim().min(2).max(200),
  position: reportPositionSchema,
  description: z.string().trim().min(20).max(4000),
  contact: reportContactSchema,
  consent: z.literal(true),
});

export type ReportInput = z.infer<typeof reportSchema>;

export const myNewsSchema = z.object({
  workingTitle: z.string().trim().min(3).max(160),
  whatHappened: z.string().trim().min(40).max(8000),
  whereWhen: z.string().trim().min(3).max(400),
  publishName: z.string().trim().min(2).max(120),
  contact: z.string().trim().min(3).max(200),
  rightsAck: z.literal(true),
  factsAck: z.literal(true),
});

export type MyNewsInput = z.infer<typeof myNewsSchema>;

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  road: "Път",
  city: "Градска среда",
  other: "Друго",
};
