create table public.polit_compass_reports (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  request_key uuid not null,
  snapshot jsonb not null,
  unique (request_key, snapshot)
);
