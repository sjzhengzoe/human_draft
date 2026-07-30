alter table public.dishes
  add column if not exists record_type text not null default 'home',
  add column if not exists recommended_items text[] not null default '{}',
  add column if not exists source_dining_place_id uuid;

alter table public.dishes
  alter column category_id drop not null;

alter table public.dishes
  drop constraint if exists dishes_name_check,
  drop constraint if exists dishes_record_type_check,
  drop constraint if exists dishes_recommended_items_check,
  drop constraint if exists dishes_record_fields_check;

alter table public.dishes
  add constraint dishes_name_check
    check (char_length(name) between 1 and 120),
  add constraint dishes_record_type_check
    check (record_type in ('home', 'outside')),
  add constraint dishes_recommended_items_check
    check (cardinality(recommended_items) <= 50),
  add constraint dishes_record_fields_check
    check (
      (record_type = 'home' and category_id is not null and cardinality(recommended_items) = 0)
      or
      (record_type = 'outside' and category_id is null)
    );

create unique index if not exists dishes_source_dining_place_unique
  on public.dishes(source_dining_place_id)
  where source_dining_place_id is not null;

with current_max as (
  select user_id, coalesce(max(sort_order), 0) as max_order
  from public.dishes
  group by user_id
),
outside_records as (
  select
    place.*,
    row_number() over (
      partition by place.user_id
      order by place.sort_order, place.created_at, place.id
    ) as row_number
  from public.dining_places as place
)
insert into public.dishes (
  id,
  user_id,
  name,
  record_type,
  category_id,
  recommended_items,
  image_path,
  thumbnail_path,
  meal_periods,
  printed_at,
  sort_order,
  source_dining_place_id,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  outside_record.user_id,
  outside_record.name,
  'outside',
  null,
  coalesce(outside_record.menu_items[1:50], '{}'),
  '',
  null,
  array['lunch', 'dinner']::text[],
  null,
  coalesce(current_max.max_order, 0) + outside_record.row_number * 1000,
  outside_record.id,
  outside_record.created_at,
  outside_record.updated_at
from outside_records as outside_record
left join current_max on current_max.user_id = outside_record.user_id
where not exists (
  select 1
  from public.dishes as existing
  where existing.source_dining_place_id = outside_record.id
);

drop function if exists public.create_dish_at_end(
  uuid, uuid, text, uuid, text, text, text[]
);

create function public.create_dish_at_end(
  p_user_id uuid,
  p_id uuid,
  p_name text,
  p_record_type text,
  p_category_id uuid,
  p_image_path text,
  p_thumbnail_path text,
  p_meal_periods text[],
  p_recommended_items text[]
)
returns setof public.dishes
language plpgsql
security definer
set search_path = public
as $$
declare
  next_order bigint;
begin
  if p_record_type not in ('home', 'outside') then
    raise exception using errcode = '22023', message = '记录类型无效';
  end if;

  if p_record_type = 'home' and not exists (
    select 1 from public.categories
    where id = p_category_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = '分类不存在';
  end if;

  if p_record_type = 'outside' and p_category_id is not null then
    raise exception using errcode = '22023', message = '外食记录不能设置居家分类';
  end if;

  if p_meal_periods is null
    or cardinality(p_meal_periods) not between 1 and 3
    or not p_meal_periods <@ array['breakfast', 'lunch', 'dinner']::text[]
  then
    raise exception using errcode = '22023', message = '适用餐次无效';
  end if;

  if cardinality(coalesce(p_recommended_items, '{}')) > 50 then
    raise exception using errcode = '22023', message = '推荐菜品过多';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('dishes:' || p_user_id::text, 0)
  );

  select coalesce(max(sort_order), 0) + 1000
  into next_order
  from public.dishes
  where user_id = p_user_id;

  return query
  insert into public.dishes (
    id,
    user_id,
    name,
    record_type,
    category_id,
    recommended_items,
    image_path,
    thumbnail_path,
    meal_periods,
    sort_order
  )
  values (
    p_id,
    p_user_id,
    p_name,
    p_record_type,
    case when p_record_type = 'home' then p_category_id else null end,
    case when p_record_type = 'outside' then coalesce(p_recommended_items, '{}') else '{}' end,
    p_image_path,
    p_thumbnail_path,
    p_meal_periods,
    next_order
  )
  returning *;
end;
$$;

revoke all on function public.create_dish_at_end(
  uuid, uuid, text, text, uuid, text, text, text[], text[]
) from public, anon, authenticated;

grant execute on function public.create_dish_at_end(
  uuid, uuid, text, text, uuid, text, text, text[], text[]
) to service_role;
