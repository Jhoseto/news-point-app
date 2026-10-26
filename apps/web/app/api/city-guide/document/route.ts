import { cityGuideEnabled } from "../../../../lib/city-guide/access";
import { citySourceInRelease } from "@newspoint/content/city-sources";
import { loadCityObservations } from "../../../../lib/city-guide/local-observations";
import { cityProcedureDocuments } from "../../../../lib/city-guide/procedure-documents";
import { readProcedureFile } from "../../../../lib/city-guide/procedure-file";

const sources = new Set(["plovdiv-management-competitions", "plovdiv-auction-list", "plovdiv-public-consultations", "dz-admission-calendar", "plovdiv-low-emission-permit"]);
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  const missing = () => new Response(null, { status: 404, headers: privateHeaders });
  if (!cityGuideEnabled()) return missing();
  const params = new URL(request.url).searchParams;
  const source = params.get("sourceId") ?? "", key = params.get("recordKey") ?? "", hash = params.get("hash") ?? "";
  if (!citySourceInRelease(source) || !sources.has(source) || !key || key.length > 500 || !/^[a-f0-9]{64}$/u.test(hash)) return missing();
  const group = (await loadCityObservations(source === "dz-admission-calendar" ? "education" : source === "plovdiv-low-emission-permit" ? "transport" : "municipality", source)).find(item => item.sourceId === source && item.status === "observed");
  const record = group?.items.find(item => item.key === key);
  if (!record || !cityProcedureDocuments(record.fields.documents).some(document => document.hash === hash)) return missing();
  const bytes = await readProcedureFile(hash);
  if (!bytes) return missing();
  return new Response(new Uint8Array(bytes).buffer, { headers: { ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="moyat-plovdiv-${hash.slice(0, 12)}.pdf"`, "Content-Security-Policy": "sandbox; default-src 'none'" } });
}
