import { sql } from "drizzle-orm";
import type { SmartDb } from "@newspoint/db/smart";

/** Read-only provider reconciliation. No model requests, provisioning or spending controls. */
export async function reconcileAiCosts(db:SmartDb,fetcher:typeof fetch=fetch){
  const key=process.env.OPENAI_COSTS_READ_KEY,project=process.env.OPENAI_PROJECT_ID;
  if(!key||!project)return false;
  const start=Math.floor(Date.now()/86400_000)*86400-7*86400;
  let page:string|null=null;
  do{
    const query=new URLSearchParams({start_time:String(start),bucket_width:"1d",limit:"30","project_ids[]":project,"group_by[]":"project_id"});
    query.append("group_by[]","line_item");if(page)query.set("page",page);
    const response=await fetcher(`https://api.openai.com/v1/organization/costs?${query}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20_000),redirect:"error"});
    if(!response.ok)throw new Error(`AI cost reconciliation HTTP ${response.status}`);
    const data=await response.json() as {data?:{start_time:number;end_time:number;results:{project_id?:string;line_item?:string;amount?:{value:number;currency:string}}[]}[];has_more?:boolean;next_page?:string|null};
    if(!Array.isArray(data.data))throw new Error("Invalid provider cost response");
    for(const bucket of data.data)for(const result of bucket.results){
      if(result.project_id!==project||!result.amount||!Number.isFinite(result.amount.value))continue;
      await db.execute(sql`insert into ai_provider_costs(provider,project_id,bucket_start,bucket_end,line_item,currency,amount)
        values('openai',${project},${new Date(bucket.start_time*1000).toISOString()}::timestamptz,${new Date(bucket.end_time*1000).toISOString()}::timestamptz,${result.line_item??"total"},${result.amount.currency},${String(result.amount.value)}::numeric)
        on conflict(provider,project_id,bucket_start,line_item,currency) do update set amount=excluded.amount,bucket_end=excluded.bucket_end,checked_at=now()`);
    }
    page=data.has_more?data.next_page??null:null;
  }while(page);
  return true;
}
