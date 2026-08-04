-- Unify home and outside dishes under a common dining-place parent.
-- Legacy outside rows remain in dishes with place_id = null so older clients
-- can continue reading and editing stores during the compatibility window.

create table if not exists public.menu_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  place_type text not null,
  outside_category_id uuid,
  image_path text not null default '',
  thumbnail_path text,
  sort_order bigint not null default 0,
  source_dish_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_places_id_user_unique unique (id, user_id),
  constraint menu_places_user_id_fkey
    foreign key (user_id) references public.app_users(id) on delete cascade,
  constraint menu_places_outside_category_user_fkey
    foreign key (outside_category_id, user_id)
    references public.dining_scenes(id, user_id) on delete restrict,
  constraint menu_places_name_check check (char_length(trim(name)) between 1 and 120),
  constraint menu_places_type_check check (place_type in ('home', 'outside')),
  constraint menu_places_fields_check check (
    (place_type = 'home' and outside_category_id is null)
    or
    (place_type = 'outside' and outside_category_id is not null)
  )
);

create unique index if not exists menu_places_one_home_per_user
  on public.menu_places(user_id)
  where place_type = 'home';

create unique index if not exists menu_places_source_dish_unique
  on public.menu_places(user_id, source_dish_id)
  where source_dish_id is not null;

create index if not exists menu_places_user_type_sort_idx
  on public.menu_places(user_id, place_type, sort_order, created_at desc);

alter table public.menu_places enable row level security;
revoke all on table public.menu_places from public, anon, authenticated;
grant select, insert, update, delete on table public.menu_places to service_role;

drop trigger if exists menu_places_set_updated_at on public.menu_places;
create trigger menu_places_set_updated_at
before update on public.menu_places
for each row execute function public.set_updated_at();

alter table public.dishes
  add column if not exists place_id uuid,
  add column if not exists place_sort_order bigint;

insert into public.menu_places (
  user_id,
  name,
  place_type,
  sort_order
)
select
  app_user.id,
  '家里',
  'home',
  0
from public.app_users as app_user
where not exists (
  select 1
  from public.menu_places as existing
  where existing.user_id = app_user.id
    and existing.place_type = 'home'
);

insert into public.menu_places (
  id,
  user_id,
  name,
  place_type,
  outside_category_id,
  image_path,
  thumbnail_path,
  sort_order,
  source_dish_id,
  created_at,
  updated_at
)
select
  legacy.id,
  legacy.user_id,
  legacy.name,
  'outside',
  legacy.outside_category_id,
  legacy.image_path,
  legacy.thumbnail_path,
  legacy.sort_order,
  legacy.id,
  legacy.created_at,
  legacy.updated_at
from public.dishes as legacy
where legacy.record_type = 'outside'
  and legacy.place_id is null
  and not exists (
    select 1
    from public.menu_places as existing
    where existing.id = legacy.id
      and existing.user_id = legacy.user_id
  );

update public.dishes as dish
set
  place_id = home.id,
  place_sort_order = dish.sort_order
from public.menu_places as home
where dish.user_id = home.user_id
  and home.place_type = 'home'
  and dish.record_type = 'home'
  and dish.place_id is null;

alter table public.dishes
  drop constraint if exists dishes_place_user_fkey;

alter table public.dishes
  add constraint dishes_place_user_fkey
    foreign key (place_id, user_id)
    references public.menu_places(id, user_id)
    on delete cascade;

create index if not exists dishes_user_place_sort_idx
  on public.dishes(user_id, place_id, place_sort_order, created_at desc)
  where place_id is not null;

alter table public.dishes
  drop constraint if exists dishes_record_fields_check;

alter table public.dishes
  add constraint dishes_record_fields_check check (
    (
      record_type = 'home'
      and category_id is not null
      and outside_category_id is null
      and cardinality(recommended_items) = 0
      and place_id is not null
    )
    or
    (
      record_type = 'outside'
      and outside_category_id is not null
      and (
        (place_id is null and category_id is null)
        or
        (place_id is not null and cardinality(recommended_items) = 0)
      )
    )
  );

create or replace function public.assign_dish_menu_place_and_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_type = 'home' and new.place_id is null then
    select place.id
    into new.place_id
    from public.menu_places as place
    where place.user_id = new.user_id
      and place.place_type = 'home'
    limit 1;
  end if;

  if new.place_id is not null and new.place_sort_order is null then
    perform pg_advisory_xact_lock(
      hashtextextended('menu-dishes:' || new.user_id::text || ':' || new.place_id::text, 0)
    );
    select coalesce(min(dish.place_sort_order) - 1000, 1000)
    into new.place_sort_order
    from public.dishes as dish
    where dish.user_id = new.user_id
      and dish.place_id = new.place_id;
  end if;

  return new;
end;
$$;

revoke all on function public.assign_dish_menu_place_and_order() from public;

drop trigger if exists dishes_assign_menu_place_and_order on public.dishes;
create trigger dishes_assign_menu_place_and_order
before insert on public.dishes
for each row execute function public.assign_dish_menu_place_and_order();

insert into public.dishes (
  user_id,
  name,
  record_type,
  category_id,
  outside_category_id,
  recommended_items,
  main_ingredients,
  introduction,
  cooking_methods,
  taste,
  flavor_options,
  image_path,
  thumbnail_path,
  meal_periods,
  place_id,
  place_sort_order,
  created_at,
  updated_at
)
select
  legacy.user_id,
  trim(recommended.name),
  'outside',
  null,
  legacy.outside_category_id,
  '{}',
  '{}',
  '',
  '{}',
  '',
  '{}',
  '',
  null,
  legacy.meal_periods,
  place.id,
  recommended.position::bigint * 1000,
  legacy.created_at + recommended.position * interval '1 microsecond',
  legacy.updated_at
from public.dishes as legacy
join public.menu_places as place
  on place.source_dish_id = legacy.id
  and place.user_id = legacy.user_id
cross join lateral unnest(legacy.recommended_items)
  with ordinality as recommended(name, position)
where legacy.record_type = 'outside'
  and legacy.place_id is null
  and trim(recommended.name) <> ''
  and not exists (
    select 1
    from public.dishes as existing
    where existing.user_id = legacy.user_id
      and existing.place_id = place.id
      and lower(trim(existing.name)) = lower(trim(recommended.name))
  );

create or replace function public.sync_menu_place_from_legacy_dish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_type <> 'outside' or new.place_id is not null then
    return new;
  end if;

  insert into public.menu_places (
    id,
    user_id,
    name,
    place_type,
    outside_category_id,
    image_path,
    thumbnail_path,
    sort_order,
    source_dish_id,
    created_at,
    updated_at
  ) values (
    new.id,
    new.user_id,
    new.name,
    'outside',
    new.outside_category_id,
    new.image_path,
    new.thumbnail_path,
    new.sort_order,
    new.id,
    new.created_at,
    new.updated_at
  )
  on conflict (id) do update set
    name = excluded.name,
    outside_category_id = excluded.outside_category_id,
    image_path = excluded.image_path,
    thumbnail_path = excluded.thumbnail_path,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at;

  update public.dishes as child
  set outside_category_id = new.outside_category_id
  where child.user_id = new.user_id
    and child.place_id = new.id
    and child.record_type = 'outside'
    and child.outside_category_id is distinct from new.outside_category_id;

  insert into public.dishes (
    user_id,
    name,
    record_type,
    category_id,
    outside_category_id,
    recommended_items,
    main_ingredients,
    introduction,
    cooking_methods,
    taste,
    flavor_options,
    image_path,
    thumbnail_path,
    meal_periods,
    place_id,
    place_sort_order
  )
  select
    new.user_id,
    trim(recommended.name),
    'outside',
    null,
    new.outside_category_id,
    '{}',
    '{}',
    '',
    '{}',
    '',
    '{}',
    '',
    null,
    new.meal_periods,
    new.id,
    recommended.position::bigint * 1000
  from unnest(new.recommended_items)
    with ordinality as recommended(name, position)
  where trim(recommended.name) <> ''
    and not exists (
      select 1
      from public.dishes as existing
      where existing.user_id = new.user_id
        and existing.place_id = new.id
        and lower(trim(existing.name)) = lower(trim(recommended.name))
    );

  return new;
end;
$$;

revoke all on function public.sync_menu_place_from_legacy_dish() from public;

drop trigger if exists dishes_sync_menu_place_from_legacy on public.dishes;
create trigger dishes_sync_menu_place_from_legacy
after insert or update of name, outside_category_id, image_path, thumbnail_path,
  sort_order, recommended_items on public.dishes
for each row
when (new.record_type = 'outside' and new.place_id is null)
execute function public.sync_menu_place_from_legacy_dish();

create or replace function public.delete_menu_place_from_legacy_dish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.record_type = 'outside' and old.place_id is null then
    delete from public.menu_places
    where user_id = old.user_id
      and source_dish_id = old.id;
  end if;
  return old;
end;
$$;

revoke all on function public.delete_menu_place_from_legacy_dish() from public;

drop trigger if exists dishes_delete_menu_place_from_legacy on public.dishes;
create trigger dishes_delete_menu_place_from_legacy
after delete on public.dishes
for each row
when (old.record_type = 'outside' and old.place_id is null)
execute function public.delete_menu_place_from_legacy_dish();

create or replace function public.create_menu_dish(
  p_user_id uuid,
  p_id uuid,
  p_place_id uuid,
  p_name text,
  p_category_id uuid,
  p_image_path text,
  p_thumbnail_path text,
  p_meal_periods text[],
  p_main_ingredients text[],
  p_introduction text,
  p_cooking_methods text[],
  p_taste text,
  p_flavor_options text[]
)
returns setof public.dishes
language plpgsql
security definer
set search_path = public
as $$
declare
  place public.menu_places;
begin
  select * into place
  from public.menu_places
  where id = p_place_id
    and user_id = p_user_id;

  if place.id is null then
    raise exception using errcode = 'P0002', message = '用餐地点不存在';
  end if;

  if trim(coalesce(p_name, '')) = '' or char_length(trim(p_name)) > 120 then
    raise exception using errcode = '22023', message = '菜名无效';
  end if;

  if place.place_type = 'home' and not exists (
    select 1 from public.categories
    where id = p_category_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = '分类不存在';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories
    where id = p_category_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = '分类不存在';
  end if;

  if p_meal_periods is null
    or cardinality(p_meal_periods) not between 1 and 3
    or not p_meal_periods <@ array['breakfast', 'lunch', 'dinner']::text[]
  then
    raise exception using errcode = '22023', message = '适用餐次无效';
  end if;

  if cardinality(coalesce(p_main_ingredients, '{}')) > 30
    or char_length(coalesce(p_introduction, '')) > 1000
    or cardinality(coalesce(p_cooking_methods, '{}')) > 10
    or char_length(coalesce(p_taste, '')) > 120
    or cardinality(coalesce(p_flavor_options, '{}')) > 30
  then
    raise exception using errcode = '22023', message = '菜品详情格式无效';
  end if;

  return query
  insert into public.dishes (
    id,
    user_id,
    name,
    record_type,
    category_id,
    outside_category_id,
    recommended_items,
    main_ingredients,
    introduction,
    cooking_methods,
    taste,
    flavor_options,
    image_path,
    thumbnail_path,
    meal_periods,
    place_id
  ) values (
    p_id,
    p_user_id,
    trim(p_name),
    place.place_type,
    p_category_id,
    case when place.place_type = 'outside' then place.outside_category_id else null end,
    '{}',
    coalesce(p_main_ingredients, '{}'),
    coalesce(p_introduction, ''),
    coalesce(p_cooking_methods, '{}'),
    coalesce(p_taste, ''),
    coalesce(p_flavor_options, '{}'),
    coalesce(p_image_path, ''),
    p_thumbnail_path,
    p_meal_periods,
    place.id
  )
  returning *;
end;
$$;

revoke all on function public.create_menu_dish(
  uuid, uuid, uuid, text, uuid, text, text, text[], text[], text, text[], text, text[]
) from public, anon, authenticated;

grant execute on function public.create_menu_dish(
  uuid, uuid, uuid, text, uuid, text, text, text[], text[], text, text[], text, text[]
) to service_role;

create or replace function public.reorder_menu_dishes(
  p_user_id uuid,
  p_place_id uuid,
  p_dish_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_count integer;
  actual_count integer;
begin
  expected_count := coalesce(array_length(p_dish_ids, 1), 0);
  select count(*) into actual_count
  from public.dishes
  where user_id = p_user_id
    and place_id = p_place_id
    and id = any(p_dish_ids);

  if expected_count = 0 or expected_count <> actual_count then
    raise exception using errcode = '22023', message = '排序列表包含不存在的菜品';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('menu-dishes:' || p_user_id::text || ':' || p_place_id::text, 0)
  );

  with desired as (
    select id, position::bigint
    from unnest(p_dish_ids) with ordinality as row(id, position)
    union all
    select
      id,
      expected_count + row_number() over (
        order by place_sort_order, created_at desc, id
      )
    from public.dishes
    where user_id = p_user_id
      and place_id = p_place_id
      and not (id = any(p_dish_ids))
  )
  update public.dishes as dish
  set place_sort_order = desired.position * 1000
  from desired
  where dish.id = desired.id
    and dish.user_id = p_user_id
    and dish.place_id = p_place_id;
end;
$$;

revoke all on function public.reorder_menu_dishes(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.reorder_menu_dishes(uuid, uuid, uuid[])
  to service_role;
