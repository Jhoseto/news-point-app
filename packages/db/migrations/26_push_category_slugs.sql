-- Multi-rubric Web Push filters (one endpoint, many optional slugs).
alter table push_subscriptions
  add column if not exists category_slugs jsonb;

comment on column push_subscriptions.category_slugs is
  'NULL = all rubrics; non-empty JSON array of category slugs to filter notifications.';
