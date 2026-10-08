begin;

-- NULL means an older revision: retain the article's existing listening policy.
alter table public.article_revisions add column if not exists listen_enabled boolean;

-- Registered explicitly by the local QA runner, before publication. No public endpoint.
create table if not exists public.editor_qa_articles (
  article_id uuid primary key references public.articles(id),
  run_id text not null check (run_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  registered_at timestamptz not null default now()
);

create or replace function public.enqueue_reader_push()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.type = 'article.published'
     and not exists(select 1 from public.editor_qa_articles where article_id = new.entity_id) then
    insert into public.push_jobs(event_id, article_id, kind, created_at, expires_at)
    values (new.id, new.entity_id, 'article', new.occurred_at, new.occurred_at + interval '1 hour')
    on conflict (event_id) do nothing;
  end if;
  return new;
end;
$$;

comment on table public.editor_qa_articles is 'Explicit QA article IDs only; excludes reader push without suppressing real publications.';
commit;
