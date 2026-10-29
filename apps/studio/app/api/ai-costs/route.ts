import { getDb } from "@newspoint/db";
import { readAiCosts, costFilters } from "@newspoint/db/ai-usage";
import { safeCsvCell } from "@newspoint/content/smart";
import { staffFromRequest } from "../../../lib/session";
import { canReadLogs } from "../../../lib/editor/roles";
import { withStaffAudit } from "../../../lib/audit";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","Vary":"Cookie"};
async function handle(request:Request){
  const staff=await staffFromRequest(request);
  if(!staff)return Response.json({error:"Влезте отново."},{status:401,headers});
  if(!canReadLogs(staff.role))return Response.json({error:"Нямате достъп до AI разходите."},{status:403,headers});
  try{
    const params=new URL(request.url).searchParams;const report=await readAiCosts(getDb(),costFilters(params));
    if(params.get("export")==="csv"){
      if(!report.ready)return Response.json({error:"Отчетността още не е активирана."},{status:503,headers});
      const rows=report.operations.length?report.operations:report.articles;
      const columns=report.operations.length?["id","operation","provider","model","status","amount","startedAt"]:["id","title","path","amount","calls","searches","pending"];
      const csv="\uFEFF"+[columns.map(safeCsvCell).join(","),...rows.map(row=>columns.map(c=>safeCsvCell(row[c])).join(","))].join("\r\n");
      return new Response(csv,{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="newspoint-ai-costs-current-page.csv"'}});
    }
    return Response.json(report,{headers});
  }catch(error){return Response.json({error:error instanceof Error&&error.message.startsWith("invalid_")?"Невалиден период или филтър.":"Отчетът временно не е достъпен."},{status:error instanceof Error&&error.message.startsWith("invalid_")?400:503,headers});}
}
export const GET=withStaffAudit(handle);
