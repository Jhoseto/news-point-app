-- Apply manually: allow the confirmed 100 MiB final podcast file limit.
-- No episodes or media files are rewritten or deleted.
begin;
alter table podcasts drop constraint podcasts_bytes_check;
alter table podcasts add constraint podcasts_bytes_check
  check (bytes between 1 and 104857600);
commit;
