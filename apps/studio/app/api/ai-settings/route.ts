import {getDb,loadRootEnv} from "@newspoint/db";
import {smartProviderSelectionSchema} from "@newspoint/content/smart";
import {readSmartProviderSettings,writeSmartProvider} from "@newspoint/db/smart-settings";
import {SmartError} from "@newspoint/db/smart";
import {staffFromRequest} from "../../../lib/session";
import {canReadLogs} from "../../../lib/editor/roles";
import {editorMutation} from "../../../lib/api";
import {EditorError} from "../../../lib/articles";
import {withStaffAudit} from "../../../lib/audit";
import {auditEvidence} from "../../../lib/audit-context";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","Vary":"Cookie"};
async function handleGET(request:Request){
  const staff=await staffFromRequest(request);
  if(!staff)return Response.json({error:{message:"Влезте отново."}},{status:401,headers});
  if(!canReadLogs(staff.role))return Response.json({error:{message:"Нямате достъп до AI настройките."}},{status:403,headers});
  try{loadRootEnv();return Response.json(await readSmartProviderSettings(getDb()),{headers});}
  catch{return Response.json({error:{message:"Настройките временно не са достъпни."}},{status:503,headers});}
}
async function handlePOST(request:Request){
  const response=await editorMutation(request,smartProviderSelectionSchema,async(staff,input)=>{
    if(!canReadLogs(staff.role))throw new EditorError(403,"forbidden","Нямате достъп до AI настройките.");
    try{
      loadRootEnv();const result=await writeSmartProvider(getDb(),input,staff);
      auditEvidence(result.before,result.after);
      return result.settings;
    }catch(error){if(error instanceof SmartError){const status=error.status===403||error.status===409||error.status===422?error.status:503;throw new EditorError(status,error.code,error.message);}throw error;}
  });
  for(const [name,value] of Object.entries(headers))response.headers.set(name,value);
  return response;
}

export const GET=withStaffAudit(handleGET);
export const POST=withStaffAudit(handlePOST);

