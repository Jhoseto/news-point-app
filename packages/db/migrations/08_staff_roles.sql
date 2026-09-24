-- 08 Staff roles as confirmed by Koce on 24.09.2026: editor, admin, master_admin.
-- Requires 07. Safe to re-run. Existing accounts keep access: reporter and
-- chief_editor become editor and admin.

alter table public.staff_users drop constraint if exists staff_users_role_check;

update public.staff_users set role = 'editor' where role = 'reporter';
update public.staff_users set role = 'admin' where role = 'chief_editor';

alter table public.staff_users
  alter column role set default 'editor',
  add constraint staff_users_role_check check (role in ('editor', 'admin', 'master_admin'));
