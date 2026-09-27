-- Private, optimized profile photos for authenticated Studio users.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-profile-images', 'studio-profile-images', false, 2097152, array['image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/webp'];

commit;
