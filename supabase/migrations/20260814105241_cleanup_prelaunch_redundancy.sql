-- The project is not launched. Collapse completed compatibility windows into
-- one schema and abort atomically if live data no longer matches the audit.

do $$
begin
  if exists (
    select 1
    from public.dishes as legacy
    left join public.menu_places as place on place.source_dish_id = legacy.id
    where legacy.record_type = 'outside'
      and legacy.place_id is null
      and (
        place.id is null
        or place.user_id is distinct from legacy.user_id
        or place.name is distinct from legacy.name
        or place.outside_category_id is distinct from legacy.outside_category_id
        or place.image_path is distinct from legacy.image_path
      )
  ) then
    raise exception 'Legacy store rows changed after audit';
  end if;

  if exists (
    select 1
    from public.menu_schedule_items as item
    join public.menu_places as place on place.source_dish_id = item.dish_id
  ) or exists (
    select 1
    from public.menu_favorites as favorite
    join public.menu_places as place on place.source_dish_id = favorite.dish_id
  ) then
    raise exception 'Legacy store rows still have live references';
  end if;
end;
$$;

drop trigger if exists dishes_sync_menu_place_from_legacy on public.dishes;
drop trigger if exists dishes_delete_menu_place_from_legacy on public.dishes;
drop function if exists public.sync_menu_place_from_legacy_dish();
drop function if exists public.delete_menu_place_from_legacy_dish();

delete from public.dishes as legacy
using public.menu_places as place
where place.source_dish_id = legacy.id
  and legacy.record_type = 'outside'
  and legacy.place_id is null;

drop index if exists public.menu_places_source_dish_unique;
alter table public.menu_places drop column if exists source_dish_id;

drop function if exists public.create_dish_at_end(uuid, text, uuid, text, text);
drop function if exists public.create_dish_at_end(uuid, uuid, text, text, uuid, uuid, text, text, text[], text[]);
drop function if exists public.create_dish_at_end(uuid, uuid, text, text, uuid, uuid, text, text, text[], text[], text[], text, text[], text[], text[]);
drop function if exists public.create_menu_dish(uuid, uuid, uuid, text, uuid, text, text, text[], text[], text, text[], text[], text[]);
drop function if exists public.create_wardrobe_item_at_end(uuid, uuid, uuid, text, text, text, jsonb);

alter table public.dishes drop column if exists thumbnail_path;
alter table public.menu_places drop column if exists thumbnail_path;
alter table public.activity_items drop column if exists thumbnail_path;
alter table public.wardrobe_items drop column if exists thumbnail_path;
alter table public.key_moments drop column if exists thumbnail_path;

alter table public.dishes
  drop constraint if exists dishes_record_fields_check,
  drop constraint if exists dishes_recommended_items_check;
alter table public.dishes drop column if exists recommended_items;
update public.dishes as dish
set
  category_id = case when place.place_type = 'home' then dish.category_id else null end,
  outside_category_id = case when place.place_type = 'outside' then place.outside_category_id else null end,
  record_type = place.place_type
from public.menu_places as place
where place.id = dish.place_id
  and place.user_id = dish.user_id;
alter table public.dishes
  add constraint dishes_record_fields_check check (
    place_id is not null
    and (
      (record_type = 'home' and category_id is not null and outside_category_id is null)
      or
      (record_type = 'outside' and category_id is null and outside_category_id is not null)
    )
  ) not valid;
alter table public.dishes validate constraint dishes_record_fields_check;
alter table public.dishes alter column place_id set not null;

drop trigger if exists media_entries_sync_personal_rating on public.media_entries;
drop function if exists public.sync_media_personal_rating();
alter table public.media_entries drop column if exists is_revisitable;

create function public.create_menu_place_at_end(
  p_user_id uuid,
  p_id uuid,
  p_name text,
  p_outside_category_id uuid,
  p_image_path text
)
returns setof public.menu_places
language plpgsql
security definer
set search_path = public
as $$
declare
  next_order bigint;
begin
  if trim(coalesce(p_name, '')) = '' or char_length(trim(p_name)) > 120 then
    raise exception using errcode = '22023', message = '店铺名无效';
  end if;
  if not exists (
    select 1 from public.dining_scenes
    where id = p_outside_category_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = '外食分类不存在';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('menu-places:' || p_user_id::text, 0));
  select coalesce(max(sort_order), 0) + 1000 into next_order
  from public.menu_places where user_id = p_user_id and place_type = 'outside';

  return query
  insert into public.menu_places (
    id, user_id, name, place_type, outside_category_id, image_path, sort_order
  ) values (
    p_id, p_user_id, trim(p_name), 'outside', p_outside_category_id,
    coalesce(p_image_path, ''), next_order
  )
  returning *;
end;
$$;

revoke all on function public.create_menu_place_at_end(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_menu_place_at_end(uuid, uuid, text, uuid, text)
  to service_role;

create function public.update_menu_place(
  p_user_id uuid,
  p_place_id uuid,
  p_name text,
  p_outside_category_id uuid
)
returns setof public.menu_places
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(coalesce(p_name, '')) = '' or char_length(trim(p_name)) > 120 then
    raise exception using errcode = '22023', message = '店铺名无效';
  end if;
  if not exists (
    select 1 from public.dining_scenes
    where id = p_outside_category_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = '外食分类不存在';
  end if;
  if not exists (
    select 1 from public.menu_places
    where id = p_place_id and user_id = p_user_id and place_type = 'outside'
    for update
  ) then
    raise exception using errcode = 'P0002', message = '店铺不存在';
  end if;

  update public.dishes
  set outside_category_id = p_outside_category_id
  where user_id = p_user_id and place_id = p_place_id;

  return query
  update public.menu_places
  set name = trim(p_name), outside_category_id = p_outside_category_id
  where id = p_place_id and user_id = p_user_id
  returning *;
end;
$$;

revoke all on function public.update_menu_place(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.update_menu_place(uuid, uuid, text, uuid)
  to service_role;

create function public.create_menu_dish(
  p_user_id uuid,
  p_id uuid,
  p_place_id uuid,
  p_name text,
  p_category_id uuid,
  p_image_path text,
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
  select * into place from public.menu_places
  where id = p_place_id and user_id = p_user_id;
  if place.id is null then
    raise exception using errcode = 'P0002', message = '用餐地点不存在';
  end if;
  if trim(coalesce(p_name, '')) = '' or char_length(trim(p_name)) > 120 then
    raise exception using errcode = '22023', message = '菜名无效';
  end if;
  if place.place_type = 'home' and not exists (
    select 1 from public.categories where id = p_category_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = '分类不存在';
  end if;
  if place.place_type = 'outside' and p_category_id is not null then
    raise exception using errcode = '22023', message = '外食菜品不能设置居家分类';
  end if;
  if p_meal_periods is null
    or cardinality(p_meal_periods) not between 1 and 4
    or not p_meal_periods <@ array['breakfast', 'lunch', 'afternoon_tea', 'dinner']::text[]
  then
    raise exception using errcode = '22023', message = '适用餐次无效';
  end if;

  return query
  insert into public.dishes (
    id, user_id, name, record_type, category_id, outside_category_id,
    main_ingredients, introduction, cooking_methods, taste,
    flavor_options, image_path, meal_periods, place_id
  ) values (
    p_id, p_user_id, trim(p_name), place.place_type,
    case when place.place_type = 'home' then p_category_id else null end,
    case when place.place_type = 'outside' then place.outside_category_id else null end,
    coalesce(p_main_ingredients, '{}'), coalesce(p_introduction, ''),
    coalesce(p_cooking_methods, '{}'), coalesce(p_taste, '{}'),
    coalesce(p_flavor_options, '{}'), coalesce(p_image_path, ''),
    p_meal_periods, place.id
  )
  returning *;
end;
$$;

revoke all on function public.create_menu_dish(
  uuid, uuid, uuid, text, uuid, text, text[], text[], text, text[], text[], text[]
) from public, anon, authenticated;
grant execute on function public.create_menu_dish(
  uuid, uuid, uuid, text, uuid, text, text[], text[], text, text[], text[], text[]
) to service_role;

create function public.create_wardrobe_item_at_end(
  p_id uuid,
  p_user_id uuid,
  p_category_id uuid,
  p_name text,
  p_image_path text,
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
  select coalesce(max(sort_order), 0) + 1000 into next_order
  from public.wardrobe_items where user_id = p_user_id;

  return query
  insert into public.wardrobe_items (
    id, user_id, category_id, name, image_path, values, sort_order
  ) values (
    p_id, p_user_id, p_category_id, p_name, p_image_path, p_values, next_order
  )
  returning *;
end;
$$;

revoke all on function public.create_wardrobe_item_at_end(uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_wardrobe_item_at_end(uuid, uuid, uuid, text, text, jsonb)
  to service_role;

create or replace function public.archive_and_delete_menu_place(
  p_user_id uuid,
  p_place_id uuid,
  p_dish_archives jsonb,
  p_place_archive_image_path text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  source_place public.menu_places;
  archived_count integer := 0;
  changed_count integer := 0;
begin
  select * into source_place from public.menu_places
  where id = p_place_id and user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PLACE_NOT_FOUND';
  end if;
  if source_place.place_type <> 'outside' then
    raise exception using errcode = '22023', message = 'HOME_PLACE_READ_ONLY';
  end if;

  with dish_archives as (
    select archive.dish_id, coalesce(archive.archive_image_path, '') as archive_image_path
    from jsonb_to_recordset(coalesce(p_dish_archives, '[]'::jsonb))
      as archive(dish_id uuid, archive_image_path text)
  )
  update public.menu_schedule_items as item
  set record_type = dish.record_type,
      snapshot_name = dish.name,
      snapshot_place_name = source_place.name,
      snapshot_image_path = coalesce(archive.archive_image_path, ''),
      snapshot_place_image_path = coalesce(p_place_archive_image_path, ''),
      dish_id = null, place_id = null, archived_at = now()
  from public.dishes as dish
  left join dish_archives as archive on archive.dish_id = dish.id
  where item.user_id = p_user_id
    and item.source_kind = 'dish'
    and item.dish_id = dish.id
    and dish.user_id = p_user_id
    and dish.place_id = p_place_id;
  get diagnostics archived_count = row_count;

  update public.menu_schedule_items
  set record_type = 'outside', snapshot_name = source_place.name,
      snapshot_place_name = source_place.name,
      snapshot_image_path = coalesce(p_place_archive_image_path, ''),
      snapshot_place_image_path = coalesce(p_place_archive_image_path, ''),
      dish_id = null, place_id = null, archived_at = now()
  where user_id = p_user_id and source_kind = 'place' and place_id = p_place_id;
  get diagnostics changed_count = row_count;
  archived_count := archived_count + changed_count;

  delete from public.menu_favorites
  where user_id = p_user_id and (
    (source_kind = 'place' and place_id = p_place_id)
    or (source_kind = 'dish' and dish_id in (
      select id from public.dishes where user_id = p_user_id and place_id = p_place_id
    ))
  );

  delete from public.menu_places where id = p_place_id and user_id = p_user_id;
  return archived_count;
end;
$$;

revoke all on function public.archive_and_delete_menu_place(uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.archive_and_delete_menu_place(uuid, uuid, jsonb, text)
  to service_role;

-- Remove obsolete pre-user-isolation RPC overloads. Current server calls all
-- remaining business RPCs with p_user_id.
drop function if exists public.add_next_media_episode(uuid);
drop function if exists public.create_dining_scene_at_end(text);
drop function if exists public.create_media_category_at_end(text);
drop function if exists public.create_media_entry_at_end(text, text, text, text[]);
drop function if exists public.create_media_season_with_episodes(uuid, text, integer);
drop function if exists public.move_luggage_group(uuid, uuid, boolean);
drop function if exists public.move_luggage_item(uuid, uuid, uuid);
drop function if exists public.move_luggage_item(uuid, uuid, uuid, boolean);
drop function if exists public.move_media_entry_to_type_at_end(uuid, text, text, text, text[]);
drop function if exists public.reorder_dishes(uuid[]);
drop function if exists public.reorder_media_entries(text, uuid[]);
drop function if exists public.search_favorite_media_episodes(text, text);
drop function if exists public.swap_activity_item_sort_orders(uuid, uuid);
drop function if exists public.swap_dining_scene_sort_orders(uuid, uuid);
drop function if exists public.swap_dish_sort_orders(uuid, uuid);
drop function if exists public.swap_luggage_group_sort_orders(uuid, uuid);
drop function if exists public.swap_media_category_sort_orders(uuid, uuid);
drop function if exists public.swap_media_entry_sort_orders(uuid, uuid);
