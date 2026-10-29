import { randomUUID } from "node:crypto";
import { z } from "zod";
import { startAiOperation, settleAiOperation, markAiUnknown, parseOpenAiUsage } from "./ai-usage";
import { SmartError, type SmartArticle, type SmartDb } from "./smart";

export type SmartConfig = { enabled: boolean; key: string; model: string; preparationModel: string; secret: string; origin: string; contentOrigin:string; project: string | null };
export function smartConfig(env: Record<string, string | undefined> = process.env): SmartConfig {
  const model = env.SMART_MODEL || "gpt-6.1-sol", preparationModel = env.SMART_PREPARATION_MODEL || "gpt-6-luna";
  const allowed = new Set(["gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-luna"]);
  if (!allowed.has(model) || !allowed.has(preparationModel)) throw new SmartError("model_config", 503, "NewsPoint Smart очаква конфигурация.");
  return { enabled: env.SMART_ENABLED === "1", key: env.OPENAI_API_KEY ?? "", model, preparationModel,
    secret: env.SMART_SIGNING_SECRET ?? "", origin: new URL(env.WEB_URL || "http://localhost:3000").origin,contentOrigin:new URL(env.SMART_CONTENT_ORIGIN||"https://newspoint.bg").origin, project: env.OPENAI_PROJECT_ID ?? null };
}
export type AiResult = { data: Record<string, unknown>; text: string; sources: { url: string; title: string }[] };
export async function smartAi(db: SmartDb, config: SmartConfig, article: SmartArticle | null, operation: string,
  request: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<AiResult> {
  if (!config.key) throw new SmartError("key", 503, "NewsPoint Smart още не е свързан.");
  const model = String(request.model ?? config.model);
  if (![config.model, config.preparationModel, "text-embedding-3-small"].includes(model) || model.includes("astra")) throw new SmartError("model", 503, "Невалиден Smart модел.");
  const id = await startAiOperation(db, { module: "smart", provider: "openai", projectId: config.project, articleId: article?.id ?? null, title: article?.title ?? "", path: article?.path ?? "", operation, model });
  try {
    const embedding = model === "text-embedding-3-small";
    const response = await fetcher(`https://api.openai.com/v1/${embedding ? "embeddings" : "responses"}`, {
      method: "POST", headers: { "Authorization": `Bearer ${config.key}`, "Content-Type": "application/json", "X-Client-Request-Id": id,
        ...(config.project ? { "OpenAI-Project": config.project } : {}) },
      body: JSON.stringify(embedding ? request : { model, reasoning: { effort: "medium" }, store: false, service_tier: "default", max_output_tokens: 7000, ...request }),
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
    let text = "";
    const sources: { url: string; title: string }[] = [];
    for (const item of items) {
      for (const part of Array.isArray(item.content) ? item.content as Record<string, unknown>[] : []) {
        if (part.type === "output_text" && typeof part.text === "string") text += part.text;
        for (const annotation of Array.isArray(part.annotations) ? part.annotations as Record<string, unknown>[] : [])
          if (annotation.type === "url_citation" && typeof annotation.url === "string") sources.push({ url: annotation.url, title: String(annotation.title ?? annotation.url) });
      }
    }
    return { data, text, sources: [...new Map(sources.map(s => [s.url, s])).values()] };
  } catch (error) {
    await markAiUnknown(db, id, error instanceof SmartError ? error.code : "network_or_usage_unknown");
    throw error instanceof SmartError ? error : new SmartError("provider", 503, "Проучването временно не е достъпно.");
  }
}
export async function smartJson<T>(db: SmartDb, config: SmartConfig, article: SmartArticle, operation: string, instructions: string, input: unknown, schema: z.ZodType<T>) {
  const request={
    model: config.model, instructions, input: JSON.stringify(input),
    ...(operation==="assessment"?{reasoning:{effort:"low"}}:{}),
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
  try { return schema.parse(JSON.parse(result.text)) as T; }
  catch { throw new SmartError("validation", 503, "Отговорът не премина проверката на източниците."); }
}
export async function smartEmbedding(db: SmartDb, config: SmartConfig, article: SmartArticle | null, texts: string[]) {
  const result = await smartAi(db, config, article, "embedding", { model: "text-embedding-3-small", input: texts, dimensions: 1536 });
  const items = z.array(z.object({ index: z.number().int(), embedding: z.array(z.number().finite()).length(1536) })).parse(result.data.data).sort((a,b) => a.index-b.index);
  if (items.length !== texts.length || items.some((x,i) => x.index !== i)) throw new SmartError("embedding", 503, "Индексът очаква обновяване.");
  return items.map(x => x.embedding);
}
export const smartPublicQuestionId = () => randomUUID();
