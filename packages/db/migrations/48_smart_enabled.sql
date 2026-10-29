-- Keep the currently active Smart installation active. No provider calls.
begin;
alter table smart_settings add column enabled boolean not null default true;
commit;
