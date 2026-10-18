import { withStaffAudit } from "@/lib/audit";
import { staffFromRequest } from "@/lib/session";
import { finishFacebookConnection, socialPublicBase } from "@/lib/social-facebook";
async function handleGET(request: Request) {
  const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
  const staff = await staffFromRequest(request);
  if (!staff || staff.role !== "master_admin") return Response.json({ error: { message: "Влезте като мастър администратор и свържете Facebook отново." } }, { status: staff ? 403 : 401, headers });
  try {
    const url = new URL(request.url);
    const selection = await finishFacebookConnection(staff, url.searchParams.get("state") ?? "", url.searchParams.get("code") ?? "");
    return new Response(null, { status: 303, headers: { ...headers, location: `${socialPublicBase()}/settings/social/?selection=${selection}` } });
  } catch {
    return new Response(null, { status: 303, headers: { ...headers, location: "/admin/settings/social/?error=connection" } });
  }
}
export const GET = withStaffAudit(handleGET);
