import { NextRequest, NextResponse } from "next/server";
import { loadRootEnv } from "@newspoint/db";
import { PollError, publicPollState, voteInPoll } from "@newspoint/db/polls";
import { z } from "zod";
import { normalizePollIp, POLL_COOKIE, pollHash, signVoter, verifyVoter } from "@/lib/poll-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const inputSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("prepare"), id: z.uuid() }).strict(), z.object({ action: z.literal("vote"), id: z.uuid(), option: z.uuid() }).strict()]);
const attempts = new Map<string, { n: number; until: number }>();
function config() {
  loadRootEnv();
  const secret = process.env.POLL_SIGNING_SECRET || process.env.STUDIO_SESSION_SECRET || "";
  if (secret.length < 32) throw new PollError(503,"config","Гласуването временно не е достъпно.");
  return { secret, origin: new URL(process.env.WEB_URL || "http://localhost:3000").origin };
}
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } }); }
function failure(error: unknown) {
  if (error instanceof PollError) return json({ error: error.message, code: error.code }, error.status);
  if (error instanceof z.ZodError) return json({ error: "Невалидна анкета.", code: "invalid_input" }, 400);
  console.error("[polls] request failed", error instanceof Error ? error.message : "unknown");
  return json({ error: "Анкетата временно не е достъпна. Опитайте отново." },503);
}
function requestIp(request: Request) {
  const header = process.env.POLL_TRUSTED_IP_HEADER?.toLowerCase();
  // Production MUST use a single-IP header overwritten by the trusted ingress.
  // Never trust arbitrary browser-supplied X-Forwarded-For or choose its first entry.
  if (header) {
    if (!/^[a-z0-9-]{1,64}$/.test(header)) throw new PollError(503,"ip_config","Гласуването временно не е достъпно.");
    const ip = normalizePollIp(request.headers.get(header)); if (ip) return ip;
  }
  else if (process.env.NODE_ENV === "development" && ["localhost","127.0.0.1","[::1]"].includes(new URL(request.url).hostname)) return "127.0.0.1";
  throw new PollError(503,"ip_config","Гласуването временно не е достъпно.");
}
function limit(key: string) {
  const now = Date.now();
  for (const [k,v] of attempts) if (v.until <= now) attempts.delete(k);
  const entry = attempts.get(key) ?? { n: 0, until: now + 60_000 };
  if (entry.n >= 30 || (!attempts.has(key) && attempts.size >= 5000)) throw new PollError(429,"rate_limit","Твърде много опити. Изчакайте една минута.");
  entry.n++; attempts.set(key,entry);
}
async function body(request: Request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "") || !request.body) throw new PollError(400,"body","Невалидна заявка.");
  const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  let expired = false; const timer = setTimeout(() => { expired = true; void reader.cancel(); },5000);
  try {
    while (true) { const part = await reader.read(); if (expired) throw new PollError(408,"timeout","Заявката отне твърде дълго."); if (part.done) break; size += part.value.byteLength; if (size > 2048) { await reader.cancel(); throw new PollError(413,"size","Твърде голяма заявка."); } chunks.push(part.value); }
    return inputSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (e) { if (e instanceof PollError) throw e; throw new PollError(400,"body","Невалидна заявка."); }
  finally { clearTimeout(timer); reader.releaseLock(); }
}
export async function GET(request: NextRequest) {
  try {
    const { secret } = config(); const id = z.uuid().parse(request.nextUrl.searchParams.get("id"));
    const voter = verifyVoter(secret,request.cookies.get(POLL_COOKIE)?.value);
    return json(await publicPollState(id,voter ? pollHash(secret,`voter:${id}`,voter) : undefined));
  } catch (e) { return failure(e); }
}
export async function POST(request: NextRequest) {
  try {
    const { secret, origin } = config();
    if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") throw new PollError(403,"origin","Гласувайте през сайта на NewsPoint.");
    const ip = requestIp(request); limit(pollHash(secret,"attempt",ip));
    const input = await body(request);
    const token = request.cookies.get(POLL_COOKIE)?.value;
    let voter = verifyVoter(secret,token);
    if (input.action === "prepare") {
      const fresh = voter ? null : signVoter(secret);
      if (fresh) voter = verifyVoter(secret,fresh);
      const response = json(await publicPollState(input.id,pollHash(secret,`voter:${input.id}`,voter!)));
      if (fresh) response.cookies.set(POLL_COOKIE,fresh,{ httpOnly: true, secure: new URL(origin).protocol === "https:", sameSite: "lax", path: "/", maxAge: 365 * 86400 });
      return response;
    }
    if (!voter) throw new PollError(403,"cookie","Разрешете бисквитките за този сайт, за да гласувате.");
    return json(await voteInPoll(input.id,input.option,pollHash(secret,`voter:${input.id}`,voter),pollHash(secret,`ip:${input.id}`,ip)));
  } catch (e) { return failure(e); }
}
