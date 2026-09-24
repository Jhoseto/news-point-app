import { NextResponse, type NextRequest } from "next/server";
import { reportSchema } from "@/lib/livepoint/forms/schema";
import { saveReport } from "@/lib/livepoint/forms/store";
import { hashIp } from "@/lib/livepoint/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Невалиден JSON." }, { status: 400 });
  }

  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Проверете полетата на формата." }, { status: 400 });
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const result = await saveReport(parsed.data, {
    ipHash: hashIp(forwarded),
    userAgent: request.headers.get("user-agent"),
  });

  if (!result.ok) {
    const status = result.code === "unavailable" ? 503 : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, reference: result.reference, id: result.id });
}
