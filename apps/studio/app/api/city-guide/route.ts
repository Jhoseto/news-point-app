import { readCityCollectorHealth } from "../../../lib/city-collector-health";
import { cityManagementInput } from "@newspoint/content/city-management";
import { changeCityManagement, readCityManagement, readCityManagementDetail } from "@newspoint/db/city-admin";
import { editorMutation } from "../../../lib/api";
import { staffFromRequest } from "../../../lib/session";
import { EditorError } from "../../../lib/articles";
import { withStaffAudit } from "../../../lib/audit";
import { auditEvidence } from "../../../lib/audit-context";

const headers = { "cache-control": "private, no-store" };
async function handleGET(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { message: "Влезте отново." } }, { status: 401, headers });
  if (!["editor", "admin", "master_admin"].includes(staff.role)) return Response.json({ error: { message: "Нямате редакционни права." } }, { status: 403, headers });
  const query = new URL(request.url).searchParams, id = query.get("id"), offset = Number(query.get("offset") ?? 0);
  if (id !== null && (!/^[a-z0-9-]{1,150}$/.test(id) || !Number.isInteger(offset) || offset < 0 || offset > 100000 || (query.get("record")?.length ?? 0) > 500)) return Response.json({ error: { message: "Невалидна справка." } }, { status: 400, headers });
  try {
    const data = id ? await readCityManagementDetail(id, offset, query.get("record") ?? undefined) : { sources: await readCityManagement(), collector: await readCityCollectorHealth(), checkedAt: new Date().toISOString() };
    return Response.json(data, { headers });
  } catch {
    return Response.json({ error: { message: "Данните временно не са достъпни. Опитайте отново." } }, { status: 503, headers });
  }
}
export const GET = withStaffAudit(handleGET);
async function handlePOST(request: Request) {
  const response = await editorMutation(request, cityManagementInput, async (_staff, input) => {
    try {
      const result = await changeCityManagement(input);
      auditEvidence(result.before, { ...result.after, note: result.note });
      return result.after;
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "conflict") throw new EditorError(409, code, "Справката е променена. Обновете данните и опитайте отново.");
      if (code === "not_found") throw new EditorError(404, code, "Източникът не е намерен.");
      if (code === "not_ready") throw new EditorError(409, code, "Нужни са актуални данни, поне седем дни проверки и потвърден тест на промяна/отмяна. Отложени източници не се публикуват.");
      throw error;
    }
  });
  response.headers.set("cache-control", headers["cache-control"]);
  return response;
}
export const POST = withStaffAudit(handlePOST);
