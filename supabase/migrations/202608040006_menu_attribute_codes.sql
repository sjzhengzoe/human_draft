-- 固定选项保存稳定编码，界面文案由应用映射，后续改文案无需改历史数据。
-- 自由填写的主要食材、介绍、衍生菜系继续保留原文。

do $$
begin
  if exists (
    select 1
    from public.dishes as dish
    cross join lateral unnest(dish.cooking_methods) as method(value)
    where method.value <> all(
      array[
        '煎炒', '蒸煮', '凉拌', '烤炸',
        'cooking_01', 'cooking_02', 'cooking_03', 'cooking_04'
      ]::text[]
    )
  ) then
    raise exception '存在无法精确匹配的历史烹饪类型，请先人工确认后再迁移';
  end if;
end;
$$;

update public.dishes as dish
set cooking_methods = (
  select coalesce(array_agg(
    case method.value
      when '煎炒' then 'cooking_01'
      when '蒸煮' then 'cooking_02'
      when '凉拌' then 'cooking_03'
      when '烤炸' then 'cooking_04'
      else method.value
    end
    order by method.position
  ), '{}'::text[]) as codes
  from unnest(dish.cooking_methods) with ordinality as method(value, position)
);

alter table public.dishes
  drop constraint if exists dishes_taste_check;

drop function if exists public.is_standard_dish_taste(text);

create or replace function public.menu_taste_labels_to_codes(value text)
returns text[]
language sql
immutable
strict
set search_path = public
as $$
  select coalesce(array_agg(
    case tag.value
      when '清淡' then 'taste_01'
      when '咸' then 'taste_02'
      when '鲜' then 'taste_03'
      when '香' then 'taste_04'
      when '酸' then 'taste_05'
      when '甜' then 'taste_06'
      when '辣' then 'taste_07'
    end
    order by tag.position
  ), '{}'::text[])
  from unnest(string_to_array(value, '、')) with ordinality as tag(value, position);
$$;

do $$
declare
  taste_data_type text;
begin
  select data_type
  into taste_data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'dishes'
    and column_name = 'taste';

  if taste_data_type = 'text' then
    if exists (
      select 1
      from public.dishes as dish
      cross join lateral unnest(string_to_array(dish.taste, '、')) as tag(value)
      where dish.taste <> ''
        and tag.value <> all(array['清淡', '咸', '鲜', '香', '酸', '甜', '辣']::text[])
    ) then
      raise exception '存在无法精确匹配的历史口味特点，请先人工确认后再迁移';
    end if;

    alter table public.dishes alter column taste drop default;
    alter table public.dishes
      alter column taste type text[]
      using case
        when taste = '' then '{}'::text[]
        else public.menu_taste_labels_to_codes(taste)
      end;
    alter table public.dishes alter column taste set default '{}'::text[];
    alter table public.dishes alter column taste set not null;
  elsif taste_data_type <> 'ARRAY' then
    raise exception 'public.dishes.taste 字段类型异常: %', taste_data_type;
  end if;
end;
$$;

drop function if exists public.menu_taste_labels_to_codes(text);

do $$
begin
  if exists (
    select 1
    from public.dishes as dish
    cross join lateral unnest(dish.cooking_methods) as method(value)
    where method.value <> all(array['cooking_01', 'cooking_02', 'cooking_03', 'cooking_04']::text[])
  ) then
    raise exception '存在非标准烹饪类型编码';
  end if;

  if exists (
    select 1
    from public.dishes as dish
    cross join lateral unnest(dish.taste) as taste(value)
    where taste.value <> all(
      array['taste_01', 'taste_02', 'taste_03', 'taste_04', 'taste_05', 'taste_06', 'taste_07']::text[]
    )
  ) then
    raise exception '存在非标准口味特点编码';
  end if;
end;
$$;

update public.dishes as dish
set cooking_methods = (
  select array(
    select code
    from unnest(array['cooking_01', 'cooking_02', 'cooking_03', 'cooking_04']::text[])
      with ordinality as allowed(code, position)
    where code = any(dish.cooking_methods)
    order by position
  )
);

update public.dishes as dish
set taste = (
  select array(
    select code
    from unnest(
      array['taste_01', 'taste_02', 'taste_03', 'taste_04', 'taste_05', 'taste_06', 'taste_07']::text[]
    ) with ordinality as allowed(code, position)
    where code = any(dish.taste)
    order by position
  )
);

create or replace function public.is_standard_menu_codes(p_values text[], p_allowed_values text[])
returns boolean
language sql
immutable
strict
set search_path = public
as $$
  select p_values <@ p_allowed_values
    and cardinality(p_values) = (
      select count(distinct value)
      from unnest(p_values) as value
    )
    and p_values = array(
      select allowed
      from unnest(p_allowed_values) with ordinality as option(allowed, position)
      where allowed = any(p_values)
      order by position
    );
$$;

alter table public.dishes
  drop constraint if exists dishes_cooking_methods_check,
  drop constraint if exists dishes_taste_check;

alter table public.dishes
  add constraint dishes_cooking_methods_check
    check (public.is_standard_menu_codes(
      cooking_methods,
      array['cooking_01', 'cooking_02', 'cooking_03', 'cooking_04']::text[]
    )),
  add constraint dishes_taste_check
    check (public.is_standard_menu_codes(
      taste,
      array['taste_01', 'taste_02', 'taste_03', 'taste_04', 'taste_05', 'taste_06', 'taste_07']::text[]
    ));

drop function if exists public.create_dish_at_end(
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[]
);

drop function if exists public.create_dish_at_end(
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[],
  text[], text, text[], text, text[]
);

create or replace function public.create_dish_at_end(
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
  p_taste text[],
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
    or not public.is_standard_menu_codes(
      coalesce(p_cooking_methods, '{}'),
      array['cooking_01', 'cooking_02', 'cooking_03', 'cooking_04']::text[]
    )
    or not public.is_standard_menu_codes(
      coalesce(p_taste, '{}'),
      array['taste_01', 'taste_02', 'taste_03', 'taste_04', 'taste_05', 'taste_06', 'taste_07']::text[]
    )
    or cardinality(coalesce(p_main_ingredients, '{}')) > 30
    or char_length(coalesce(p_introduction, '')) > 1000
    or cardinality(coalesce(p_flavor_options, '{}')) > 30
  then
    raise exception using errcode = '22023', message = '菜品详情格式无效';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dishes:' || p_user_id::text, 0));

  select coalesce(max(sort_order), 0) + 1000
  into next_order
  from public.dishes
  where user_id = p_user_id;

  return query
  insert into public.dishes (
    id, user_id, name, record_type, category_id, outside_category_id,
    recommended_items, main_ingredients, introduction, cooking_methods, taste,
    flavor_options, image_path, thumbnail_path, meal_periods, sort_order
  ) values (
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
    case when p_record_type = 'home' then coalesce(p_taste, '{}') else '{}' end,
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
  text[], text, text[], text[], text[]
) from public, anon, authenticated;

grant execute on function public.create_dish_at_end(
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[],
  text[], text, text[], text[], text[]
) to service_role;

create or replace function public.create_dish_at_end(
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
    p_user_id, p_id, p_name, p_record_type, p_category_id, p_outside_category_id,
    p_image_path, p_thumbnail_path, p_meal_periods, p_recommended_items,
    '{}'::text[], '', '{}'::text[], '{}'::text[], '{}'::text[]
  );
$$;

revoke all on function public.create_dish_at_end(
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[]
) from public, anon, authenticated;

grant execute on function public.create_dish_at_end(
  uuid, uuid, text, text, uuid, uuid, text, text, text[], text[]
) to service_role;

drop function if exists public.create_menu_dish(
  uuid, uuid, uuid, text, uuid, text, text, text[], text[], text, text[], text, text[]
);

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
  p_taste text[],
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
    or not public.is_standard_menu_codes(
      coalesce(p_cooking_methods, '{}'),
      array['cooking_01', 'cooking_02', 'cooking_03', 'cooking_04']::text[]
    )
    or not public.is_standard_menu_codes(
      coalesce(p_taste, '{}'),
      array['taste_01', 'taste_02', 'taste_03', 'taste_04', 'taste_05', 'taste_06', 'taste_07']::text[]
    )
    or cardinality(coalesce(p_flavor_options, '{}')) > 30
  then
    raise exception using errcode = '22023', message = '菜品详情格式无效';
  end if;

  return query
  insert into public.dishes (
    id, user_id, name, record_type, category_id, outside_category_id,
    recommended_items, main_ingredients, introduction, cooking_methods, taste,
    flavor_options, image_path, thumbnail_path, meal_periods, place_id
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
    coalesce(p_taste, '{}'),
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
  uuid, uuid, uuid, text, uuid, text, text, text[], text[], text, text[], text[], text[]
) from public, anon, authenticated;

grant execute on function public.create_menu_dish(
  uuid, uuid, uuid, text, uuid, text, text, text[], text[], text, text[], text[], text[]
) to service_role;
