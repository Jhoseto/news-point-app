-- Portable semantic storage; no server extension or superuser privileges.
-- No paid embedding generation runs as part of this migration.
begin;
create table smart_documents (
  article_id uuid not null references articles(id) on delete cascade, revision text not null,
  chunk integer not null, text text not null, embedding bytea not null check(octet_length(embedding)=6144),
  model text not null default 'text-embedding-3-small', indexed_at timestamptz not null default now(),
  primary key(article_id,chunk)
);
create index smart_documents_indexed on smart_documents(indexed_at);
commit;
