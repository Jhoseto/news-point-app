import "server-only";
import { articleEdgePath } from "../../../packages/content/src/article-edge-cache";
import { articleEdgeConfig } from "./article-edge-render";

export async function purgeArticleEdgePaths(paths: string[]): Promise<"disabled" | "ok" | "error"> {
  if (process.env.NP_ARTICLE_EDGE_CACHE !== "1") return "disabled";
  const config = articleEdgeConfig();
  if (!config) return "error";
  const files = [...new Set(paths.flatMap(path => ["desktop", "mobile"].flatMap(viewport => {
    const endpoint = articleEdgePath(path,viewport as "desktop" | "mobile");
    return endpoint ? [new URL(endpoint,config.publicOrigin).href] : [];
  })))];
  if (!files.length) return "ok";
  const signal = AbortSignal.timeout(6500);
  try {
    for (let i=0;i<files.length;i+=30) {
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${config.zoneId}/purge_cache`,{
        method:"POST",redirect:"error",cache:"no-store",signal,
        headers:{"content-type":"application/json",authorization:`Bearer ${config.token}`},
        body:JSON.stringify({files:files.slice(i,i+30)}),
      });
      if (!response.ok) { await response.body?.cancel(); return "error"; }
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("success" in body) || body.success !== true) return "error";
    }
    return "ok";
  } catch { return "error"; }
}
