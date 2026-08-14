-- COS is the only image store. PostgreSQL keeps the authoritative asset ledger
-- used for account usage reporting; request-time COS inventory scans are gone.

create table public.image_assets (
  object_key text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  module text not null check (
    module in ('menu', 'activities', 'media', 'wardrobe', 'key_moments', 'avatars')
  ),
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text not null default 'application/octet-stream',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint image_assets_object_key_length
    check (char_length(object_key) between 1 and 2048),
  constraint image_assets_mime_type_length
    check (char_length(mime_type) between 1 and 255)
);

create index image_assets_user_module_idx
  on public.image_assets (user_id, module);

alter table public.image_assets enable row level security;

create trigger image_assets_set_updated_at
before update on public.image_assets
for each row execute function public.set_updated_at();

revoke all on table public.image_assets from public, anon, authenticated;
grant select, insert, update, delete on table public.image_assets to service_role;

create function public.get_user_image_storage_usage(p_user_id uuid)
returns table (
  module text,
  image_count bigint,
  used_bytes bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with modules(module, sort_order) as (
    values
      ('menu', 1),
      ('activities', 2),
      ('media', 3),
      ('wardrobe', 4),
      ('key_moments', 5),
      ('avatars', 6)
  )
  select
    modules.module,
    count(image_assets.object_key)::bigint,
    coalesce(sum(image_assets.size_bytes), 0)::bigint
  from modules
  left join public.image_assets
    on image_assets.module = modules.module
   and image_assets.user_id = p_user_id
  group by modules.module, modules.sort_order
  order by modules.sort_order;
$$;

revoke all on function public.get_user_image_storage_usage(uuid)
  from public, anon, authenticated;
grant execute on function public.get_user_image_storage_usage(uuid)
  to service_role;

drop function if exists public.private_image_storage_inventory(text[], uuid);
drop function if exists public.admin_image_storage_inventory(text[]);
