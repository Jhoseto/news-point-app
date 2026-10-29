import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {sql} from "drizzle-orm";
import {createScriptDb,findRepoRoot} from "../node";
import {smartConfig} from "../smart-provider";
import {indexSmartArticle} from "../smart-index";
import {SmartError} from "../smart";
async function main(){
 const args=process.argv.slice(2),limit=args.includes("--limit")?Number(args[args.indexOf("--limit")+1]):null;
 if(limit!==null&&(!Number.isInteger(limit)||limit<1))throw new Error("Invalid --limit");
 const concurrency=args.includes("--concurrency")?Number(args[args.indexOf("--concurrency")+1]):8;
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>32)throw new Error("Invalid --concurrency");
 const {db,close}=createScriptDb("dev",8),startedAt=new Date().toISOString();
 try{
  const config=smartConfig();
  if(config.provider === "minimax"){console.log("MiniMax uses current public content directly; no embedding backfill or OpenAI requests.");return;}
  if(!config.key)throw new Error("Smart provider key missing");
  const rows=await db.execute(sql`select a.id from smart_public_articles a where a.published_at>=now()-interval '6 months'
    and not exists(select 1 from smart_documents d where d.article_id=a.id and d.revision=a.revision)
    order by a.published_at desc limit ${limit??2147483647}`);
  let cursor=0,completed=0,stopped=false;const counts:Record<string,number>={},errors:{articleId:string;code:string}[]=[];
  const output=resolve(findRepoRoot(),"tests","reports","smart-index-progress.json");await mkdir(resolve(output,".."),{recursive:true});
  const save=()=>writeFile(output,JSON.stringify({startedAt,updatedAt:new Date().toISOString(),eligibleUnindexedAtStart:rows.length,completed,counts,errors,stopped,window:"6 calendar months"},null,2));
  await Promise.all(Array.from({length:Math.min(concurrency,rows.length)},async()=>{
   while(!stopped){const row=rows[cursor++];if(!row)break;
    try{const state=await indexSmartArticle(db,config,String(row.id));counts[state]=(counts[state]??0)+1;completed++;}
    catch(error){errors.push({articleId:String(row.id),code:error instanceof SmartError?error.code:error instanceof Error?error.name:"failed"});stopped=true;}
    if(completed%25===0){console.log(JSON.stringify({completed,total:rows.length,counts}));await save();}
   }
  }));
  await save();console.log(JSON.stringify({completed,total:rows.length,counts,errors,output}));if(errors.length)process.exitCode=1;
 }finally{await close();}
}
main().catch(error=>{console.error(error instanceof SmartError?error.code:error instanceof Error?error.name:"index_failed");process.exitCode=1;});
