import "server-only";
import { readFile } from "node:fs/promises";
import { isAbsolute,resolve } from "node:path";
import { findRepoRoot } from "@newspoint/db/node";
import { CITY_SOURCE_POLICY,citySourceInRelease } from "@newspoint/content/city-sources";
export type CityCollectorStatus={status:"ok"|"degraded"|"stopped"|"unavailable"|"not-configured";checkedAt:string|null};
export async function readCityCollectorHealth():Promise<CityCollectorStatus>{
 const storage=process.env.CITY_GUIDE_STORAGE_DIR || (process.env.NODE_ENV==="development"?resolve(findRepoRoot(),"tests/reports/city-preview-live"):"");
 if(!storage||!isAbsolute(storage))return{status:"not-configured",checkedAt:null};
 try{
  const raw=await readFile(resolve(storage,"collector-health.json"),"utf8");if(raw.length>100000)throw new Error("oversized");
  const data=JSON.parse(raw),expected=Object.keys(CITY_SOURCE_POLICY).filter(citySourceInRelease);
  if(data.version!==1||!Array.isArray(data.sources)||data.expectedSources!==expected.length||data.sources.length!==expected.length||new Set(data.sources.map((s:{id:unknown})=>s?.id)).size!==expected.length||!expected.every(id=>data.sources.some((s:{id:unknown})=>s?.id===id))||data.healthySources!==data.sources.filter((s:{status:unknown})=>s?.status==="healthy").length||!["ok","degraded"].includes(data.status))throw new Error("invalid health");
  const age=Date.now()-Date.parse(data.checkedAt);if(!Number.isFinite(age)||age<0||age>600000)return{status:"stopped",checkedAt:Number.isFinite(Date.parse(data.checkedAt))?data.checkedAt:null};
  return{status:data.status==="ok"&&data.healthySources===expected.length?"ok":"degraded",checkedAt:data.checkedAt};
 }catch{return{status:"unavailable",checkedAt:null}}
}
