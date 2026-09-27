-- D0-10 / D1-3: optional presentation metadata, separate from media location.
-- Koce applies manually. No archive rewrite, bucket or public access policy.
begin;

create table if not exists public.media_presentations (
  media_asset_id uuid primary key references public.media_assets(id) on delete cascade,
  variants jsonb not null default '[]'::jsonb,
  focal_x real,
  focal_y real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_presentations_variants_check check (
    jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) <= 6
  ),
  constraint media_presentations_focal_check check (
    (focal_x is null and focal_y is null)
    or (focal_x is not null and focal_y is not null and focal_x between 0 and 1 and focal_y between 0 and 1)
  )
);

drop trigger if exists media_presentations_set_updated_at on public.media_presentations;
create trigger media_presentations_set_updated_at before update on public.media_presentations
  for each row execute function public.set_updated_at();
alter table public.media_presentations enable row level security;

commit;
