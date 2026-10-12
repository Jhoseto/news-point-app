-- 33 editor_qa_articles: allow article delete (Studio materials desk).
-- Safe to re-run. Requires 30.

alter table public.editor_qa_articles
  drop constraint if exists editor_qa_articles_article_id_fkey;

alter table public.editor_qa_articles
  add constraint editor_qa_articles_article_id_fkey
  foreign key (article_id) references public.articles (id) on delete cascade;
