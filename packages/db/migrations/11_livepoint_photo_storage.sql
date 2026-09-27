-- Apply after 10_livepoint_submissions.sql in the existing Supabase project.
-- Private, server-only uploads; no public/anon/authenticated object policies are added.
-- Original uploads never reach Storage: the server validates and re-encodes them.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('livepoint-submissions', 'livepoint-submissions', false, 10485760, array['image/webp'])
on conflict (id) do nothing;

-- Refuse an existing bucket with weaker restrictions; don't silently change its data/access.
do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'livepoint-submissions'
      and public = false and file_size_limit = 10485760
      and allowed_mime_types = array['image/webp']
  ) then
    raise exception 'livepoint-submissions exists with different settings; review it before applying migration 11';
  end if;
end $$;
commit;
