-- D1-1 follow-up: preserve the name snapshot when a staff account is deleted.
-- Migration 13 used ON DELETE SET NULL, so the matching checks must allow a
-- historical staff byline without a live profile reference.
begin;

alter table public.articles drop constraint if exists articles_author_attribution_check;
alter table public.articles add constraint articles_author_attribution_check check (
  author_kind in ('staff', 'newsroom', 'manual')
  and char_length(author_name) between 2 and 120
  and author_name = btrim(author_name)
  and author_name !~ '[[:cntrl:]]'
  and (
    author_kind = 'staff'
    or (author_kind = 'newsroom' and author_user_id is null and author_name = 'NewsPoint.bg')
    or (author_kind = 'manual' and author_user_id is null)
  )
);

alter table public.article_revisions drop constraint if exists article_revisions_author_attribution_check;
alter table public.article_revisions add constraint article_revisions_author_attribution_check check (
  author_kind in ('staff', 'newsroom', 'manual')
  and char_length(author_name) between 2 and 120
  and author_name = btrim(author_name)
  and author_name !~ '[[:cntrl:]]'
  and (
    author_kind = 'staff'
    or (author_kind = 'newsroom' and author_user_id is null and author_name = 'NewsPoint.bg')
    or (author_kind = 'manual' and author_user_id is null)
  )
);

commit;
