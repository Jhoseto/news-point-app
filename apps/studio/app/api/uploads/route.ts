import { mediaUploadAPI } from "@/lib/media-upload-api";
import { withStaffAudit } from "@/lib/audit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handlePOST(request: Request) { return mediaUploadAPI(request); }
export const POST = withStaffAudit(handlePOST);
