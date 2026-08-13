-- Service-only inventory used to verify private Storage migrations and recoveries.

create or replace function public.private_image_storage_inventory(p_bucket_ids text[])
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

revoke all on function public.private_image_storage_inventory(text[]) from public, anon, authenticated;
grant execute on function public.private_image_storage_inventory(text[]) to service_role;
