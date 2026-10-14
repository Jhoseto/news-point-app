-- Apply manually before releasing podcast upload optimization.
-- Retains every existing MP3 key; no audio files or episode rows are rewritten.
begin;
alter table public.podcasts drop constraint if exists podcasts_audio_key_check;
alter table public.podcasts add constraint podcasts_audio_key_check
  check (audio_key ~ '^podcasts/[0-9]{4}/[0-9]{2}/[0-9a-f-]+\.(mp3|m4a)$');
commit;
