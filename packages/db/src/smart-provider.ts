import { randomUUID,createHash } from "node:crypto";
import { z } from "zod";
import { startAiOperation, settleAiOperation, markAiUnknown, parseOpenAiUsage } from "./ai-usage";
import { SmartError, type SmartArticle, type SmartDb } from "./smart";
import {smartPromptInput} from "./smart-evidence";

export type SmartConfig = { enabled: boolean; provider: "openai" | "minimax"; key: string; model: string; preparationModel: string; researchModel:string; answerPlanModel?:string; secret: string; origin: string; contentOrigin:string; project: string | null };
export function smartConfig(env: Record<string, string | undefined> = process.env): SmartConfig {
  const provider = env.SMART_PROVIDER || "minimax";
  if(provider !== "openai" && provider !== "minimax")throw new SmartError("provider_config",503,"Невалиден Smart доставчик.");
  const model = provider === "minimax" ? env.MINIMAX_SMART_MODEL || "MiniMax-M3.1-Flash" : env.SMART_MODEL || "gpt-6.1-sol";
  const preparationModel = provider === "minimax" ? env.MINIMAX_SMART_PREPARATION_MODEL || "MiniMax-M3.1-Flash" : env.SMART_PREPARATION_MODEL || "gpt-6-luna";
  const researchModel=provider === "minimax" ? env.MINIMAX_SMART_RESEARCH_MODEL || "MiniMax-M3" : model;
  const allowed = new Set(provider === "minimax" ? ["MiniMax-M3", "MiniMax-M3.1-Flash"] : ["gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-luna"]);
  if (!allowed.has(model) || !allowed.has(preparationModel) || !allowed.has(researchModel)) throw new SmartError("model_config", 503, "NewsPoint Smart очаква конфигурация.");
  return { enabled: env.SMART_ENABLED === "1", provider, key: (provider === "minimax" ? env.MINIMAX_API_KEY : env.OPENAI_API_KEY)?.trim() ?? "", model, preparationModel, researchModel,
    secret: env.SMART_SIGNING_SECRET ?? "", origin: new URL(env.WEB_URL || "http://localhost:3000").origin,contentOrigin:new URL(env.SMART_CONTENT_ORIGIN||"https://newspoint.bg").origin, project: provider === "openai" ? env.OPENAI_PROJECT_ID ?? null : null };
}
/** Fixed origins and no redirects keep each credential with its own provider. */
export function smartProviderRequest(config:SmartConfig,request:Record<string,unknown>) {
  const embedding=request.model === "text-embedding-3-small";
  if(config.provider === "minimax" && embedding)throw new SmartError("embedding_provider",503,"OpenAI е изключен за NewsPoint Smart.");
  const body:Record<string,unknown>={model:config.model,reasoning:{effort:"medium"},store:false,service_tier:config.provider === "minimax" ? "standard" : "default",max_output_tokens:7000,...request};
  if(config.provider === "minimax") {
    delete body.include;delete body.max_tool_calls;
    if(body.model === "MiniMax-M3.1-Flash")delete body.service_tier;
    if(body.tools){body.tools=[{type:"web_search"}];body.tool_choice="auto";}
    const format=(body.text as {format?:{schema?:unknown}}|undefined)?.format;
    // Do not assume strict schema support; enforce the schema locally on every result.
    if(format?.schema){body.instructions=String(body.instructions??"")+"\nВърни единствено валиден JSON обект, без Markdown, по тази JSON Schema: "+JSON.stringify(format.schema);delete body.text;}
  }
  return {url:`https://${config.provider === "minimax" ? "api.minimax.io" : "api.openai.com"}/v1/${embedding?"embeddings":"responses"}`,body:embedding?request:body};
}
export type AiResult = { data: Record<string, unknown>; text: string; sources: { url: string; title: string }[] };
/** One controlled discovery request instead of an agent's unbounded search loop.
 * Search snippets never become evidence. An undocumented price stays unknown. */
export async function smartMiniMaxSearch(db:SmartDb,config:SmartConfig,article:SmartArticle,query:string,fetcher:typeof fetch=fetch){
  if(config.provider!=="minimax"||!config.key)throw new SmartError("key",503,"Търсенето не е свързано.");
  const model="MiniMax-Web-Search";
  const id=await startAiOperation(db,{module:"smart",provider:"minimax",model,articleId:article.id,title:article.title,path:article.path,operation:"research_search"});
  try{
    const response=await fetcher("https://api.minimax.io/v1/coding_plan/search",{method:"POST",redirect:"error",signal:AbortSignal.timeout(12_000),headers:{Authorization:`Bearer ${config.key}`,"Content-Type":"application/json","X-Client-Request-Id":id},body:JSON.stringify({q:query.slice(0,600)})});
    const data=await response.json() as Record<string,unknown>;
    const parsed=z.object({base_resp:z.object({status_code:z.number()}),organic:z.array(z.object({title:z.string(),link:z.string()})).max(100).optional()}).safeParse(data);
    const success=response.ok&&parsed.success&&parsed.data.base_resp.status_code===0;
    // Count the call even when the provider returns no token usage. There is no
    // verified price for this endpoint in AI_RATES: Studio must show unknown.
    await settleAiOperation(db,id,model,{input:0,cachedInput:0,cacheWrite:0,output:0,reasoning:0,searches:1},null,response.headers.get("x-request-id"),success?"search_tariff_unconfirmed":"search_failed_tariff_unconfirmed");
    if(!success||!parsed.success)throw new SmartError("provider",503,"Външното проучване не завърши.");
    const found=new Map<string,{url:string;title:string}>();
    for(const item of parsed.data.organic??[]){
      try{const url=new URL(item.link);if(url.protocol!=="https:"||url.username||url.password)continue;found.set(url.href,{url:url.href,title:item.title.slice(0,500)||url.hostname});}catch{/* malformed discovery URL */}
    }
    return [...found.values()];
  }catch(error){await markAiUnknown(db,id,"search_network_or_usage_unknown");throw error instanceof SmartError?error:new SmartError("provider",503,"Външното проучване временно не е достъпно.");}
}
export async function smartAi(db: SmartDb, config: SmartConfig, article: SmartArticle | null, operation: string,
  request: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<AiResult> {
  if (!config.key) throw new SmartError("key", 503, "NewsPoint Smart още не е свързан.");
  const model = String(request.model ?? config.model);
  if (![config.model, config.preparationModel, config.researchModel, "text-embedding-3-small"].includes(model) || model.includes("astra")) throw new SmartError("model", 503, "Невалиден Smart модел.");
  const prepared=smartProviderRequest(config,request);
  const id = await startAiOperation(db, { module: "smart", provider: config.provider, projectId: config.project, articleId: article?.id ?? null, title: article?.title ?? "", path: article?.path ?? "", operation, model });
  try {
    const response = await fetcher(prepared.url, {
      method: "POST", headers: { "Authorization": `Bearer ${config.key}`, "Content-Type": "application/json", "X-Client-Request-Id": id,
        ...(config.provider === "openai" && config.project ? { "OpenAI-Project": config.project } : {}) },
      body: JSON.stringify(prepared.body),
      signal: AbortSignal.timeout(operation==="research"?180_000:90_000),
      redirect:"error",
    });
    const data = await response.json() as Record<string, unknown>;
    // Meter before validation/display: rejected, incomplete and failed outputs may cost money.
    const usage = parseOpenAiUsage(data);
    const incomplete=data.incomplete_details as {reason?:string}|undefined;
    const failure=!response.ok?`http_${response.status}`:data.status==="incomplete"?`incomplete_${String(incomplete?.reason??"unknown").slice(0,80)}`:data.status==="failed"?"provider_failed":null;
    await settleAiOperation(db, id, String(data.model ?? model), usage, typeof data.id === "string" ? data.id : null, response.headers.get("x-request-id"),failure);
    if (!response.ok || data.status === "incomplete" || data.status === "failed") throw new SmartError(data.status==="incomplete"&&usage?"provider_incomplete_known":"provider", 503, "Проучването не завърши. Опитайте отново след малко.");
    const items = Array.isArray(data.output) ? data.output as Record<string, unknown>[] : [];
    if(config.provider === "minimax" && operation === "research" && !items.some(item=>item.type === "web_search_call" && item.status === "completed"))throw new SmartError("research_not_performed",503,"Външното проучване не завърши.");
    let text = "";
    const sources: { url: string; title: string }[] = [];
    for (const item of items) {
      for (const part of Array.isArray(item.content) ? item.content as Record<string, unknown>[] : []) {
        if (part.type === "output_text" && typeof part.text === "string") text += part.text;
        for (const annotation of Array.isArray(part.annotations) ? part.annotations as Record<string, unknown>[] : [])
          if (annotation.type === "url_citation" && typeof annotation.url === "string") sources.push({ url: annotation.url, title: String(annotation.title ?? annotation.url) });
      }
    }
    if(!text && typeof data.output_text === "string")text=data.output_text;
    if(config.provider === "minimax" && operation === "research") {
      // Discovery only: pages are still fetched and checked before becoming evidence.
      for(const url of [...(text.match(/https:\/\/[^\s<>"\])]+/gu)??[])].reverse())sources.unshift({url:url.replace(/[.,;]+$/u,""),title:url});
    }
    return { data, text, sources: [...new Map(sources.map(s => [s.url, s])).values()] };
  } catch (error) {
    await markAiUnknown(db, id, error instanceof SmartError ? error.code : "network_or_usage_unknown");
    throw error instanceof SmartError ? error : new SmartError("provider", 503, "Проучването временно не е достъпно.");
  }
}
export async function smartJson<T>(db: SmartDb, config: SmartConfig, article: SmartArticle, operation: string, instructions: string, input: unknown, schema: z.ZodType<T>) {
  const request={
    model: config.model, instructions, input: config.provider==="minimax"?smartPromptInput(input):JSON.stringify(input),
    ...(config.provider==="minimax"?{prompt_cache_key:`np-smart:${createHash("sha256").update(JSON.stringify([config.model,article.id,article.revision,operation.replace(/_(repair|retry)$/u,"")])).digest("hex")}`} : {}),
    ...(["assessment","retrieval","prepare","prepare_verification",...(config.provider==="minimax"?["answer","answer_context","answer_repair","verification"]:[])].includes(operation)?{reasoning:{effort:config.provider==="minimax"&&config.model==="MiniMax-M3"&&operation==="retrieval"?"none":"low"}}:{}),
    text: { format: { type: "json_schema", name: "smart_result", strict: true, schema: z.toJSONSchema(schema) } },
  };
  let result:AiResult;
  try{result=await smartAi(db,config,article,operation,request);}
  catch(error){
    // Retry only an explicitly incomplete response whose consumption was returned.
    // Timeouts/unknown usage never trigger a silent second provider call.
    if(!(error instanceof SmartError)||error.code!=="provider_incomplete_known")throw error;
    result=await smartAi(db,config,article,`${operation}_retry`,{...request,reasoning:{effort:"low"},max_output_tokens:12000});
  }
  const parse=(text:string)=>schema.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/u,"$1"))) as T;
  try { return parse(result.text); }
  catch(error) {
    if(config.provider === "minimax") {
      // One metered format repair; source/quote/entailment checks remain unchanged.
      // Previous model text stays untrusted input, never a system instruction.
      const repaired=await smartAi(db,config,article,`${operation}_format_repair`,{...request,
        reasoning:{effort:"low"},instructions:instructions+" Поправи само JSON формата и ограниченията по схемата. Не добавяй факти. Спазвай максималните дължини на всички полета, особено explanation и researchQuery. Върни само JSON.",
        input:JSON.stringify({originalInput:input,previousOutput:result.text,issues:error instanceof z.ZodError?error.issues.map(issue=>({path:issue.path,code:issue.code,message:issue.message})):"invalid_json"})});
      try{return parse(repaired.text);}catch{/* Fail closed after the bounded repair. */}
    }
    throw new SmartError("validation", 503, "Отговорът не премина проверката на източниците.");
  }
}
export async function smartEmbedding(db: SmartDb, config: SmartConfig, article: SmartArticle | null, texts: string[]) {
  const result = await smartAi(db, config, article, "embedding", { model: "text-embedding-3-small", input: texts, dimensions: 1536 });
  const items = z.array(z.object({ index: z.number().int(), embedding: z.array(z.number().finite()).length(1536) })).parse(result.data.data).sort((a,b) => a.index-b.index);
  if (items.length !== texts.length || items.some((x,i) => x.index !== i)) throw new SmartError("embedding", 503, "Индексът очаква обновяване.");
  return items.map(x => x.embedding);
}
export const smartPublicQuestionId = () => randomUUID();
