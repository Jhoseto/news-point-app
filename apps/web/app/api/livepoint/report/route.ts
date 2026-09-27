import type { NextRequest } from "next/server";
import { reportSchema } from "@/lib/livepoint/forms/schema";
import { saveReport } from "@/lib/livepoint/forms/store";
import { CONTACT_ERROR } from "@/lib/livepoint/forms/contact";
import { handleSubmission } from "@/lib/livepoint/forms/submission-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return handleSubmission(request, reportSchema, saveReport, path => path === "contact" ? CONTACT_ERROR : path === "position" ? "Посочете точка върху картата." : "Проверете полетата на формата.");
}
