import { withStaffAudit } from "../../../../../lib/audit";
import { staffFromRequest } from "@/lib/session";
import { readProfilePhoto } from "@/lib/profile-photo";

export const runtime = "nodejs";

async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await staffFromRequest(request);
  if (!staff) return new Response(null, { status: 401, headers: { "cache-control": "no-store" } });
  const { id } = await params;
  return (await readProfilePhoto(id)) ?? new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
}

export const GET = withStaffAudit(handleGET);
