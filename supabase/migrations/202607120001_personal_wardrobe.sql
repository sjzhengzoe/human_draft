create table if not exists public.wardrobe_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wardrobe_categories_user_name_unique unique (user_id, name),
  constraint wardrobe_categories_id_user_unique unique (id, user_id),
  constraint wardrobe_categories_user_sort_unique
    unique (user_id, sort_order) deferrable initially immediate
);

create index if not exists wardrobe_categories_user_sort_idx
on public.wardrobe_categories(user_id, sort_order);

create table if not exists public.wardrobe_items (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  category_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  image_path text not null,
  thumbnail_path text,
  values jsonb not null default '{}'::jsonb check (jsonb_typeof(values) = 'object'),
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wardrobe_items_category_owner_fk
    foreign key (category_id, user_id)
    references public.wardrobe_categories(id, user_id),
  constraint wardrobe_items_user_sort_unique
    unique (user_id, sort_order) deferrable initially immediate
);

create index if not exists wardrobe_items_user_category_sort_idx
on public.wardrobe_items(user_id, category_id, sort_order);

drop trigger if exists wardrobe_categories_set_updated_at
on public.wardrobe_categories;
create trigger wardrobe_categories_set_updated_at
before update on public.wardrobe_categories
for each row execute function public.set_updated_at();

drop trigger if exists wardrobe_items_set_updated_at
on public.wardrobe_items;
create trigger wardrobe_items_set_updated_at
before update on public.wardrobe_items
for each row execute function public.set_updated_at();

alter table public.wardrobe_categories enable row level security;
alter table public.wardrobe_items enable row level security;

grant select, insert, update, delete
on table public.wardrobe_categories, public.wardrobe_items
to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wardrobe-images',
  'wardrobe-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.create_wardrobe_category_at_end(
  p_user_id uuid,
  p_name text,
  p_fields jsonb
)
returns setof public.wardrobe_categories
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_order bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.wardrobe_categories:sort_order:' || p_user_id::text, 0)
  );

  select coalesce(max(sort_order), 0) + 1000
  into next_order
  from public.wardrobe_categories
  where user_id = p_user_id;

  return query
  insert into public.wardrobe_categories (user_id, name, fields, sort_order)
  values (p_user_id, p_name, p_fields, next_order)
  returning *;
end;
$$;

create or replace function public.create_wardrobe_item_at_end(
  p_id uuid,
  p_user_id uuid,
  p_category_id uuid,
  p_name text,
  p_image_path text,
  p_thumbnail_path text,
  p_values jsonb
)
returns setof public.wardrobe_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_order bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.wardrobe_items:sort_order:' || p_user_id::text, 0)
  );

  select coalesce(max(sort_order), 0) + 1000
  into next_order
  from public.wardrobe_items
  where user_id = p_user_id;

  return query
  insert into public.wardrobe_items (
    id,
    user_id,
    category_id,
    name,
    image_path,
    thumbnail_path,
    values,
    sort_order
  )
  values (
    p_id,
    p_user_id,
    p_category_id,
    p_name,
    p_image_path,
    p_thumbnail_path,
    p_values,
    next_order
  )
  returning *;
end;
$$;

create or replace function public.swap_wardrobe_category_sort_orders(
  p_user_id uuid,
  p_source_id uuid,
  p_target_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_order bigint;
  target_order bigint;
  locked_count integer;
begin
  if p_source_id is null or p_target_id is null or p_source_id = p_target_id then
    raise exception using errcode = '22023', message = '请选择两个不同的分类交换位置';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public.wardrobe_categories:sort_order:' || p_user_id::text, 0)
  );

  perform id
  from public.wardrobe_categories
  where user_id = p_user_id
    and id = any(array[p_source_id, p_target_id])
  order by id
  for update;
  get diagnostics locked_count = row_count;

  if locked_count <> 2 then
    raise exception using errcode = 'P0002', message = '衣物分类不存在';
  end if;

  select sort_order into source_order
  from public.wardrobe_categories
  where user_id = p_user_id and id = p_source_id;

  select sort_order into target_order
  from public.wardrobe_categories
  where user_id = p_user_id and id = p_target_id;

  set constraints wardrobe_categories_user_sort_unique deferred;

  update public.wardrobe_categories
  set sort_order = case id
    when p_source_id then target_order
    when p_target_id then source_order
  end
  where user_id = p_user_id
    and id = any(array[p_source_id, p_target_id]);
end;
$$;

create or replace function public.swap_wardrobe_item_sort_orders(
  p_user_id uuid,
  p_source_id uuid,
  p_target_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_order bigint;
  target_order bigint;
  locked_count integer;
begin
  if p_source_id is null or p_target_id is null or p_source_id = p_target_id then
    raise exception using errcode = '22023', message = '请选择两件不同的衣物交换位置';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public.wardrobe_items:sort_order:' || p_user_id::text, 0)
  );

  perform id
  from public.wardrobe_items
  where user_id = p_user_id
    and id = any(array[p_source_id, p_target_id])
  order by id
  for update;
  get diagnostics locked_count = row_count;

  if locked_count <> 2 then
    raise exception using errcode = 'P0002', message = '衣物不存在';
  end if;

  select sort_order into source_order
  from public.wardrobe_items
  where user_id = p_user_id and id = p_source_id;

  select sort_order into target_order
  from public.wardrobe_items
  where user_id = p_user_id and id = p_target_id;

  set constraints wardrobe_items_user_sort_unique deferred;

  update public.wardrobe_items
  set sort_order = case id
    when p_source_id then target_order
    when p_target_id then source_order
  end
  where user_id = p_user_id
    and id = any(array[p_source_id, p_target_id]);
end;
$$;

revoke all on function public.create_wardrobe_category_at_end(uuid, text, jsonb)
from public, anon, authenticated;
revoke all on function public.create_wardrobe_item_at_end(uuid, uuid, uuid, text, text, text, jsonb)
from public, anon, authenticated;
revoke all on function public.swap_wardrobe_category_sort_orders(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.swap_wardrobe_item_sort_orders(uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function public.create_wardrobe_category_at_end(uuid, text, jsonb)
to service_role;
grant execute on function public.create_wardrobe_item_at_end(uuid, uuid, uuid, text, text, text, jsonb)
to service_role;
grant execute on function public.swap_wardrobe_category_sort_orders(uuid, uuid, uuid)
to service_role;
grant execute on function public.swap_wardrobe_item_sort_orders(uuid, uuid, uuid)
to service_role;
