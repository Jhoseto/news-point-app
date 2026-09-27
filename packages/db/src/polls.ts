import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "./index";
import { isPollOpen, pollInput, pollCorrection, pollResult, type Poll, type PollInput } from "./poll-types";

export class PollError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
type Db = Pick<ReturnType<typeof getDb>, "execute">;
type Actor = { id: string; name: string; role: string };
const selection = sql`id, question, description, options, status, featured, starts_at as "startsAt", ends_at as "endsAt", adjustments, version, created_at as "createdAt"`;
function normalize(row: Record<string, unknown>): Poll {
  return { ...row, startsAt: row.startsAt ? new Date(row.startsAt as string).toISOString() : null, endsAt: row.endsAt ? new Date(row.endsAt as string).toISOString() : null, createdAt: new Date(row.createdAt as string).toISOString() } as Poll;
}
export async function pollsReady() {
  const rows = await getDb().execute(sql`select to_regclass('public.polls') is not null as ready`);
  return rows[0]?.ready === true;
}
async function countsFor(db: Db, id: string) {
  const rows = await db.execute(sql`select option_id, count(*)::integer as count from poll_votes where poll_id=${id}::uuid group by option_id`);
  return Object.fromEntries(rows.map(r => [String(r.option_id), Number(r.count)]));
}
export async function featuredPoll() {
  if (!await pollsReady()) return null;
  const rows = await getDb().execute(sql`select ${selection} from polls where featured and status in ('open','closed') and (starts_at is null or starts_at <= now()) limit 1`);
  if (!rows[0]) return null;
  const p = normalize(rows[0]);
  return pollResult(p, await countsFor(getDb(), p.id));
}
export async function publicPollState(id: string, visitorHash?: string) {
  const rows = await getDb().execute(sql`select ${selection} from polls where id=${id}::uuid and status in ('open','closed') and (starts_at is null or starts_at <= now())`);
  if (!rows[0]) throw new PollError(404, "not_found", "Анкетата не е достъпна.");
  const p = normalize(rows[0]);
  const vote = visitorHash ? await getDb().execute(sql`select option_id from poll_votes where poll_id=${id}::uuid and visitor_hash=${visitorHash}`) : [];
  return { poll: pollResult(p, await countsFor(getDb(), id)), votedOption: vote[0]?.option_id as string | undefined ?? null };
}
export async function voteInPoll(id: string, option: string, visitor: string, ip: string) {
  await getDb().transaction(async tx => {
    const rows = await tx.execute(sql`select ${selection} from polls where id=${id}::uuid for update`);
    if (!rows[0] || !isPollOpen(normalize(rows[0]))) throw new PollError(409, "closed", "Гласуването е приключило или още не е започнало.");
    const p = normalize(rows[0]);
    if (!p.options.some(o => o.id === option)) throw new PollError(400, "option", "Изберете валиден отговор.");
    const existing = await tx.execute(sql`select 1 from poll_votes where poll_id=${id}::uuid and visitor_hash=${visitor}`);
    if (existing.length) throw new PollError(409, "already_voted", "Вече сте гласували в тази анкета.");
    const used = await tx.execute(sql`select count(*)::integer as n from poll_votes where poll_id=${id}::uuid and ip_hash=${ip}`);
    if (Number(used[0]?.n) >= 3) throw new PollError(429, "ip_limit", "Достигнат е лимитът от 3 гласа от тази мрежа за анкетата.");
    await tx.execute(sql`insert into poll_votes(poll_id,option_id,visitor_hash,ip_hash) values(${id}::uuid,${option}::uuid,${visitor},${ip})`);
  });
  return publicPollState(id, visitor);
}
async function audit(db: Db, p: Poll, actor: Actor, reason: string) {
  await db.execute(sql`insert into poll_revisions(poll_id,actor_id,actor_name,reason,snapshot) values(${p.id}::uuid,${actor.id},${actor.name},${reason},${JSON.stringify(p)}::jsonb)`);
}
export async function savePoll(raw: PollInput, actor: Actor) {
  const input = pollInput.parse(raw);
  return getDb().transaction(async tx => {
    // Serializes editorial changes, including the unique featured slot.
    await tx.execute(sql`select pg_advisory_xact_lock(92716001)`);
    let old: Poll | undefined;
    if (input.id) {
      const rows = await tx.execute(sql`select ${selection} from polls where id=${input.id}::uuid for update`);
      if (!rows[0]) throw new PollError(404, "not_found", "Анкетата не е намерена.");
      old = normalize(rows[0]);
      if (old.version !== input.version) throw new PollError(409, "conflict", "Има по-нова редакция. Презаредете анкетата.");
      const votes = await tx.execute(sql`select 1 from poll_votes where poll_id=${old.id}::uuid limit 1`);
      const sameOptions = old.options.length === input.options.length && old.options.every((o,i) => o.id === input.options[i]?.id && o.label === input.options[i]?.label);
      if (votes.length && (old.question !== input.question || old.description !== input.description || !sameOptions)) throw new PollError(409, "locked", "След първия глас въпросът, описанието и отговорите се заключват. Дублирайте анкетата.");
    }
    const id = old?.id ?? crypto.randomUUID();
    if (input.featured) {
      const previous = await tx.execute(sql`update polls set featured=false,version=version+1 where featured and id<>${id}::uuid returning ${selection}`);
      for (const p of previous) await audit(tx, normalize(p), actor, "Заменена на началната страница");
    }
    const rows = await tx.execute(sql`insert into polls(id,question,description,options,status,featured,starts_at,ends_at)
      values(${id}::uuid,${input.question},${input.description},${JSON.stringify(input.options)}::jsonb,${input.status},${input.featured},${input.startsAt}::timestamptz,${input.endsAt}::timestamptz)
      on conflict(id) do update set question=excluded.question,description=excluded.description,options=excluded.options,status=excluded.status,featured=excluded.featured,starts_at=excluded.starts_at,ends_at=excluded.ends_at,version=polls.version+1 returning ${selection}`);
    const saved = normalize(rows[0]!);
    await audit(tx, saved, actor, old ? "Редакция на анкета" : "Създаване на анкета");
    return saved;
  });
}
export async function correctPoll(raw: unknown, actor: Actor) {
  if (!['admin','master_admin'].includes(actor.role)) throw new PollError(403, "forbidden", "Само администратор може да коригира резултати.");
  const input = pollCorrection.parse(raw);
  return getDb().transaction(async tx => {
    const rows = await tx.execute(sql`select ${selection} from polls where id=${input.id}::uuid for update`);
    if (!rows[0]) throw new PollError(404, "not_found", "Анкетата не е намерена.");
    const p = normalize(rows[0]);
    if (p.version !== input.version) throw new PollError(409, "conflict", "Има по-нова редакция. Презаредете анкетата.");
    const counts = await countsFor(tx, p.id);
    if (Object.keys(input.deltas).some(id => !p.options.some(o => o.id === id)) || p.options.some(o => (counts[o.id] ?? 0) + (input.deltas[o.id] ?? 0) < 0)) throw new PollError(400, "invalid_counts", "Корекцията не може да дава отрицателен резултат или непознат отговор.");
    const updated = await tx.execute(sql`update polls set adjustments=${JSON.stringify(input.deltas)}::jsonb,version=version+1 where id=${p.id}::uuid returning ${selection}`);
    const saved = normalize(updated[0]!);
    await audit(tx, saved, actor, "Административна корекция на резултатите");
    return saved;
  });
}
export async function listPolls(page = 0) {
  const rows = await getDb().execute(sql`select ${selection}, (select count(*)::integer from poll_votes v where v.poll_id=polls.id) as "realTotal" from polls order by created_at desc,id limit 21 offset ${page * 20}`);
  return { items: rows.slice(0,20).map(r => ({ ...normalize(r), realTotal: Number(r.realTotal) })), more: rows.length > 20 };
}
export async function pollDetails(id: string, page = 0) {
  const rows = await getDb().execute(sql`select ${selection} from polls where id=${id}::uuid`);
  if (!rows[0]) throw new PollError(404,"not_found","Анкетата не е намерена.");
  const poll = normalize(rows[0]);
  const counts = await countsFor(getDb(), id);
  // No raw IPs or reusable visitor hashes leave the server.
  const votes = await getDb().execute(sql`select id::text,option_id as "optionId",created_at as "createdAt" from poll_votes where poll_id=${id}::uuid order by id desc limit 51 offset ${page * 50}`);
  const revisions = await getDb().execute(sql`select id::text,actor_name as "actorName",reason,snapshot,created_at as "createdAt" from poll_revisions where poll_id=${id}::uuid order by id desc limit 51 offset ${page * 50}`);
  return { poll, counts, result: pollResult(poll, counts), votes: votes.slice(0,50), revisions: revisions.slice(0,50), moreVotes: votes.length > 50, moreRevisions: revisions.length > 50 };
}
