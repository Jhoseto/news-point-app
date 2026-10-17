import { withStaffAudit } from "@/lib/audit";
import { staffFromRequest } from "@/lib/session";
import { studioOrigins } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Old tabs must refresh; never forward or buffer the obsolete large request. */
async function handlePOST(request: Request) {
 const headers = { "cache-control": "private, no-store" };
 if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) return Response.json({ error: { message: "Невалиден източник." } }, { status: 403, headers });
 if (!await staffFromRequest(request)) return Response.json({ error: { message: "Влезте отново." } }, { status: 401, headers });
 return Response.json({ error: { code: "upload_protocol_changed", message: "Начинът за качване е обновен. Презаредете Studio и изберете файла отново." } }, { status: 409, headers });
}
export const POST = withStaffAudit(handlePOST);
