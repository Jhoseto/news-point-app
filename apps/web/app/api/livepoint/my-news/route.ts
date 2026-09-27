import type { NextRequest } from "next/server";
import { myNewsSchema } from "@/lib/livepoint/forms/schema";
import { saveMyNews } from "@/lib/livepoint/forms/store";
import { handleSubmission } from "@/lib/livepoint/forms/submission-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return handleSubmission(request, myNewsSchema, saveMyNews);
}
