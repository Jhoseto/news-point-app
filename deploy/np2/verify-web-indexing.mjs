import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import { publicIndexingEnabled } from "../../apps/web/lib/indexing-policy.mjs";

export function verifyWebIndexing(env, manifest) {
  const expected = publicIndexingEnabled({ ...env, NODE_ENV: "production" }) ? "index, follow" : "noindex, nofollow";
  const rule = manifest.headers?.find(rule => rule.source === "/:path*" && rule.headers?.some(header => header.key.toLowerCase() === "x-robots-tag"));
  const actual = rule?.headers.find(header => header.key.toLowerCase() === "x-robots-tag")?.value;
  if (actual !== expected) throw Error(`Compiled global indexing header mismatch: expected ${expected}, got ${actual ?? "missing"}`);
  for (const source of ["/admin/:path*", "/api/:path*", "/draft/:path*"]) {
    if (!manifest.headers?.some(rule => rule.source === source && rule.headers?.some(header => header.key.toLowerCase() === "x-robots-tag" && header.value === "noindex, nofollow"))) throw Error(`Missing private indexing exclusion: ${source}`);
  }
  return { pass: true, expected };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = parseEnv(readFileSync(process.argv[2], "utf8"));
  console.log(JSON.stringify(verifyWebIndexing(env, JSON.parse(readFileSync(process.argv[3], "utf8")))));
}
