-- Persistent Studio selection only. No secrets, provider requests or content changes.
begin;
create table smart_settings (
  id boolean primary key default true check(id),
  provider text not null check(provider in ('minimax','openai')),
  version integer not null default 1 check(version>0),
  updated_by text references staff_users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into smart_settings(id,provider) values(true,'minimax');
commit;
