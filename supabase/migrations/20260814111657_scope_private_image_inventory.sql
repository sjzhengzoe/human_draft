-- Keep personal image usage queries user-scoped inside Postgres. Full inventory is
-- a separate service-only maintenance RPC so application requests cannot fetch it.

drop function if exists public.private_image_storage_inventory(text[]);

create function public.private_image_storage_inventory(
  p_bucket_ids text[],
  p_user_id uuid
)
returns table (
  bucket_id text,
  object_name text,
  object_size bigint,
  mime_type text
)
language sql
security definer
set search_path = public, storage
as $$
  select
    objects.bucket_id,
    objects.name,
    coalesce((objects.metadata ->> 'size')::bigint, 0),
    coalesce(objects.metadata ->> 'mimetype', 'application/octet-stream')
  from storage.objects as objects
  where objects.bucket_id = any(p_bucket_ids)
    and objects.name like 'users/' || p_user_id::text || '/%'
  order by objects.bucket_id, objects.name;
$$;

create or replace function public.admin_image_storage_inventory(p_bucket_ids text[])
returns table (
  bucket_id text,
  object_name text,
  object_size bigint,
  mime_type text
)
language sql
security definer
set search_path = public, storage
as $$
  select
    objects.bucket_id,
    objects.name,
    coalesce((objects.metadata ->> 'size')::bigint, 0),
    coalesce(objects.metadata ->> 'mimetype', 'application/octet-stream')
  from storage.objects as objects
  where objects.bucket_id = any(p_bucket_ids)
  order by objects.bucket_id, objects.name;
$$;

revoke all on function public.private_image_storage_inventory(text[], uuid)
  from public, anon, authenticated;
revoke all on function public.admin_image_storage_inventory(text[])
  from public, anon, authenticated;
grant execute on function public.private_image_storage_inventory(text[], uuid)
  to service_role;
grant execute on function public.admin_image_storage_inventory(text[])
  to service_role;
