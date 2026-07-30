alter table public.dishes
  add column if not exists meal_periods text[] not null
  default array['lunch', 'dinner']::text[];

alter table public.dishes
  drop constraint if exists dishes_meal_periods_check;

alter table public.dishes
  add constraint dishes_meal_periods_check check (
    cardinality(meal_periods) between 1 and 3
    and meal_periods <@ array['breakfast', 'lunch', 'dinner']::text[]
  );

drop function if exists public.create_dish_at_end(uuid, uuid, text, uuid, text, text);

create function public.create_dish_at_end(
  p_user_id uuid,
  p_id uuid,
  p_name text,
  p_category_id uuid,
  p_image_path text,
  p_thumbnail_path text,
  p_meal_periods text[]
)
returns setof public.dishes
language plpgsql
security definer
set search_path = public
as $$
declare
  next_order bigint;
begin
  if not exists (
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
    category_id,
    image_path,
    thumbnail_path,
    meal_periods,
    sort_order
  )
  values (
    p_id,
    p_user_id,
    p_name,
    p_category_id,
    p_image_path,
    p_thumbnail_path,
    p_meal_periods,
    next_order
  )
  returning *;
end;
$$;

revoke all on function public.create_dish_at_end(
  uuid, uuid, text, uuid, text, text, text[]
) from public, anon, authenticated;

grant execute on function public.create_dish_at_end(
  uuid, uuid, text, uuid, text, text, text[]
) to service_role;
