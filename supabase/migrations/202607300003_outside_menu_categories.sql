alter table public.dishes
  add column if not exists outside_category_id uuid;

update public.dishes as dish
set outside_category_id = place.scene_id
from public.dining_places as place
where dish.record_type = 'outside'
  and dish.outside_category_id is null
  and dish.source_dining_place_id = place.id
  and dish.user_id = place.user_id;

update public.dishes as dish
set outside_category_id = (
  select scene.id
  from public.dining_scenes as scene
  where scene.user_id = dish.user_id
  order by scene.sort_order, scene.created_at, scene.id
  limit 1
)
where dish.record_type = 'outside'
  and dish.outside_category_id is null;

alter table public.dishes
  drop constraint if exists dishes_outside_category_user_fkey,
  drop constraint if exists dishes_record_fields_check;

alter table public.dishes
  add constraint dishes_outside_category_user_fkey
    foreign key (outside_category_id, user_id)
    references public.dining_scenes(id, user_id)
    on delete restrict,
  add constraint dishes_record_fields_check
    check (
      (
        record_type = 'home'
        and category_id is not null
        and outside_category_id is null
        and cardinality(recommended_items) = 0
      )
      or
      (
        record_type = 'outside'
        and category_id is null
        and outside_category_id is not null
      )
    );

create index if not exists dishes_user_outside_category_sort_idx
  on public.dishes(user_id, outside_category_id, sort_order)
  where record_type = 'outside';

drop function if exists public.create_dish_at_end(
  uuid, uuid, text, text, uuid, text, text, text[], text[]
);

create function public.create_dish_at_end(
  p_user_id uuid,
  p_id uuid,
  p_name text,
  p_record_type text,
  p_category_id uuid,
  p_outside_category_id uuid,
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

  if p_record_type = 'outside' and not exists (
    select 1 from public.dining_scenes
    where id = p_outside_category_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = '外食分类不存在';
  end if;

  if p_record_type = 'home' and p_outside_category_id is not null then
    raise exception using errcode = '22023', message = '居家记录不能设置外食分类';
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
    outside_category_id,
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
    case when p_record_type = 'outside' then p_outside_category_id else null end,
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
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[]
) from public, anon, authenticated;

grant execute on function public.create_dish_at_end(
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[]
) to service_role;
