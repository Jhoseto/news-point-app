-- Web Push subscriptions for the reader PWA.
-- Each row is one browser/device that opted in. `category_slug` is null for the
-- default feed (all categories); a slug means the user chose to follow that
-- specific rubric. `enabled` lets the reader unsubscribe without losing the row.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  category_slug text,
  locale text not null default 'bg',
  user_agent text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_notified_at timestamptz
);

create index if not exists push_subscriptions_enabled_idx
  on push_subscriptions (enabled)
  where enabled = true;

create index if not exists push_subscriptions_category_idx
  on push_subscriptions (category_slug)
  where category_slug is not null;

comment on table push_subscriptions is 'Web Push subscriptions (reader PWA). One row per browser/device.';
comment on column push_subscriptions.category_slug is 'NULL = default feed; otherwise the rubric slug the reader follows.';
comment on column push_subscriptions.enabled is 'Reader-level opt-out without losing the row (avoids duplicate inserts on re-subscribe).';