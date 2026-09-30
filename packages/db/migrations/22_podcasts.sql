-- NewsPodcast episodes. Apply manually. No sample episodes are inserted.
begin;

create table if not exists podcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 180),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  summary text not null check (char_length(summary) between 1 and 600),
  cover_key text not null check (cover_key ~ '^podcasts/[0-9]{4}/[0-9]{2}/[0-9a-f-]+\.webp$'),
  audio_key text not null check (audio_key ~ '^podcasts/[0-9]{4}/[0-9]{2}/[0-9a-f-]+\.mp3$'),
  duration_sec integer not null check (duration_sec between 1 and 21600),
  bytes integer not null check (bytes between 1 and 83886080),
  category_id uuid references categories(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by text references staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);

create unique index if not exists podcasts_slug_key on podcasts (slug);
create index if not exists podcasts_public_idx on podcasts (published_at desc) where status = 'published';

commit;
