alter table public.dishes
  add column if not exists main_ingredients text[],
  add column if not exists introduction text,
  add column if not exists cooking_methods text[],
  add column if not exists taste text,
  add column if not exists flavor_options text[];

update public.dishes
set
  main_ingredients = coalesce(main_ingredients, '{}'),
  introduction = coalesce(introduction, ''),
  cooking_methods = coalesce(cooking_methods, '{}'),
  taste = coalesce(taste, ''),
  flavor_options = coalesce(flavor_options, '{}')
where main_ingredients is null
   or introduction is null
   or cooking_methods is null
   or taste is null
   or flavor_options is null;

alter table public.dishes
  alter column main_ingredients set default '{}',
  alter column main_ingredients set not null,
  alter column introduction set default '',
  alter column introduction set not null,
  alter column cooking_methods set default '{}',
  alter column cooking_methods set not null,
  alter column taste set default '',
  alter column taste set not null,
  alter column flavor_options set default '{}',
  alter column flavor_options set not null;

alter table public.dishes
  drop constraint if exists dishes_record_fields_check,
  drop constraint if exists dishes_main_ingredients_check,
  drop constraint if exists dishes_introduction_check,
  drop constraint if exists dishes_cooking_methods_check,
  drop constraint if exists dishes_taste_check,
  drop constraint if exists dishes_flavor_options_check;

alter table public.dishes
  add constraint dishes_main_ingredients_check
    check (cardinality(main_ingredients) <= 30),
  add constraint dishes_introduction_check
    check (char_length(introduction) <= 1000),
  add constraint dishes_cooking_methods_check
    check (cardinality(cooking_methods) <= 10),
  add constraint dishes_taste_check
    check (char_length(taste) <= 120),
  add constraint dishes_flavor_options_check
    check (cardinality(flavor_options) <= 30),
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

drop function if exists public.create_dish_at_end(
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[]
);

drop function if exists public.create_dish_at_end(
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[],
  text[], text, text[], text, text[]
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
  p_recommended_items text[],
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

  if cardinality(coalesce(p_recommended_items, '{}')) > 50
    or cardinality(coalesce(p_main_ingredients, '{}')) > 30
    or char_length(coalesce(p_introduction, '')) > 1000
    or cardinality(coalesce(p_cooking_methods, '{}')) > 10
    or char_length(coalesce(p_taste, '')) > 120
    or cardinality(coalesce(p_flavor_options, '{}')) > 30
  then
    raise exception using errcode = '22023', message = '菜品详情格式无效';
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
    main_ingredients,
    introduction,
    cooking_methods,
    taste,
    flavor_options,
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
    case when p_record_type = 'home' then coalesce(p_main_ingredients, '{}') else '{}' end,
    case when p_record_type = 'home' then coalesce(p_introduction, '') else '' end,
    case when p_record_type = 'home' then coalesce(p_cooking_methods, '{}') else '{}' end,
    case when p_record_type = 'home' then coalesce(p_taste, '') else '' end,
    case when p_record_type = 'home' then coalesce(p_flavor_options, '{}') else '{}' end,
    p_image_path,
    p_thumbnail_path,
    p_meal_periods,
    next_order
  )
  returning *;
end;
$$;

revoke all on function public.create_dish_at_end(
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[],
  text[], text, text[], text, text[]
) from public, anon, authenticated;

grant execute on function public.create_dish_at_end(
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[],
  text[], text, text[], text, text[]
) to service_role;

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
language sql
security definer
set search_path = public
as $$
  select *
  from public.create_dish_at_end(
    p_user_id,
    p_id,
    p_name,
    p_record_type,
    p_category_id,
    p_outside_category_id,
    p_image_path,
    p_thumbnail_path,
    p_meal_periods,
    p_recommended_items,
    '{}'::text[],
    '',
    '{}'::text[],
    '',
    '{}'::text[]
  );
$$;

revoke all on function public.create_dish_at_end(
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[]
) from public, anon, authenticated;

grant execute on function public.create_dish_at_end(
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[]
) to service_role;
