// Explicit manual benchmark. Never scheduled and never publishes answers to readers.
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {sql} from "drizzle-orm";
import {createScriptDb,findRepoRoot} from "../node";
import {smartConfig} from "../smart-provider";
import {smartArticle,type SmartArticle} from "../smart";
import {prepareSmartArticle,answerSmartQuestion} from "../smart-service";
import {readAiCosts} from "../ai-usage";
import type {SmartAnswer} from "@newspoint/content/smart";

async function main(){
 const args=process.argv.slice(2),value=(name:string)=>args[args.indexOf(name)+1];
 const articleId=value("--article"),turns=Number(args.includes("--turns")?value("--turns"):5),branch=Number(args.includes("--branch")?value("--branch"):0);
 if(!args.includes("--article")||!articleId||!/^[a-f0-9-]{36}$/i.test(articleId)||!Number.isInteger(turns)||turns<1||turns>5||![0,1].includes(branch))throw new Error("Use --article UUID [--turns 1..5] [--branch 0|1]");
 const {db,close}=createScriptDb("dev",1);
 try{
  const config=smartConfig();
  if(!config.key)throw new Error("OPENAI_API_KEY is missing; no provider calls were made.");
  const vector=await db.execute(sql`select to_regclass('public.smart_documents') is not null as ready`);
  if(!vector[0]?.ready)throw new Error("Apply portable migration 45, then warm the six-month archive index.");
  // Paid evaluation is separated from production metrics, while remaining fully metered.
  process.env.NODE_ENV="test";
  const started=new Date(String((await db.execute(sql`select clock_timestamp() as time`))[0]!.time)),history:{question:string;answer:SmartAnswer}[]=[];
  let article:SmartArticle|undefined,error:string|null=null,preparation:unknown=null;
  try{
   article=await smartArticle(db,articleId);
   const prepared=await prepareSmartArticle(db,config,article);preparation=prepared.payload;
   let question=prepared.payload.questions[branch]?.text;
   for(let i=0;i<turns&&question;i++){
    const answer=await answerSmartQuestion(db,config,article,question,history);
    history.push({question,answer});question=answer.followUps[branch]?.text??answer.followUps[0]?.text;
   }
  }catch(cause){error=cause instanceof Error?cause.message:"evaluation_failed";}
  const finished=new Date(String((await db.execute(sql`select clock_timestamp() as time`))[0]!.time)),costs=await readAiCosts(db,{start:started,end:finished,module:"smart",article:articleId,environment:"test",page:1});
  const output=resolve(findRepoRoot(),"tests","reports",`smart-evaluation-${articleId}-${Date.now()}.json`);
  await writeFile(output,JSON.stringify({article:article?{id:article.id,title:article.title,version:article.revision}:null,model:config.model,preparationModel:config.preparationModel,branch,started,finished,preparation,history,costs,error,editorialReview:"pending; automatic grounding checks do not establish editorial quality"},null,2));
  console.log(JSON.stringify({output,turns:history.length,costs:costs.totals,error}));
  if(error)process.exitCode=1;
 }finally{await close();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"evaluation_failed");process.exitCode=1;});
