-- Additive; apply manually. No posts are queued and no existing article jobs are changed.
begin;
create table if not exists podcast_social_publications (
  job_id uuid primary key references social_publications(id) on delete cascade,
  podcast_id uuid references podcasts(id) on delete set null,
  page_id text not null,
  title text not null check (char_length(title) between 2 and 180),
  constraint podcast_social_publications_episode_page_key unique (podcast_id, page_id)
);
commit;
