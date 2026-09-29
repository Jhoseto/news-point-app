import { sql } from "drizzle-orm";
import type { ScriptDb } from "./node";

const readiness = new WeakMap<object, { until: number; pending: Promise<boolean> }>();

export function hasArticleViewBoosts(db: Pick<ScriptDb, "execute">): Promise<boolean> {
  const current = readiness.get(db);
  if (current && current.until > Date.now()) return current.pending;
  const pending = db.execute<{ ready: boolean }>(sql`select to_regclass('public.article_view_boosts') is not null as ready`)
    .then((rows) => rows[0]?.ready === true)
    .catch(() => false);
  readiness.set(db, { until: Date.now() + 60_000, pending });
  pending.catch(() => readiness.delete(db));
  return pending;
}

/** One statement for every article whose interval is due. Missed steps are applied together, never past the target. */
export async function applyDueViewBoosts(db: Pick<ScriptDb, "execute">): Promise<number> {
  if (!await hasArticleViewBoosts(db)) return 0;
  const rows = await db.execute<{ article_id: string }>(sql`
    with due as (
      select b.article_id,
             b.artificial_count,
             b.interval_seconds,
             b.target_count,
             b.next_increment_at,
             coalesce(r.read_count, 0) as real_count
      from article_view_boosts b
      join articles a on a.id = b.article_id and a.is_public and a.published_at <= now()
      left join article_read_counts r on r.article_id = b.article_id
      where b.next_increment_at is not null
        and b.next_increment_at <= now()
        and b.interval_seconds is not null
        and b.target_count is not null
        and b.artificial_count + coalesce(r.read_count, 0) < b.target_count
      for update of b skip locked
    ),
    stepped as (
      select due.article_id,
             least(
               greatest(1, floor(extract(epoch from (now() - due.next_increment_at)) / due.interval_seconds)::bigint + 1),
               due.target_count - due.real_count - due.artificial_count
             )::bigint as steps,
             due.real_count,
             due.target_count,
             due.interval_seconds,
             due.next_increment_at
      from due
    )
    update article_view_boosts b
    set artificial_count = b.artificial_count + stepped.steps,
        next_increment_at = case
          when b.artificial_count + stepped.steps + stepped.real_count >= stepped.target_count then null
          else stepped.next_increment_at + make_interval(secs => (stepped.steps * stepped.interval_seconds)::int)
        end,
        updated_at = now()
    from stepped
    where b.article_id = stepped.article_id
      and stepped.steps > 0
    returning b.article_id
  `);
  return rows.length;
}
