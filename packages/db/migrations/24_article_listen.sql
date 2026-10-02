-- Listening is on unless an editor turns it off at publish time.
-- Existing rows and future WordPress imports keep the default.

alter table articles
  add column if not exists listen_enabled boolean not null default true;
