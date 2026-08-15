-- The single-image cleanup removed thumbnail_path from dishes and menu_places.
-- Keep schedule snapshots on the remaining canonical image_path columns.

create or replace function public.replace_menu_schedule_meal(
  p_uid text,
  p_meal_date date,
  p_meal_period text,
  p_slot_count integer,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_meal_id uuid;
  source_item jsonb;
  resolved_items jsonb := '[]'::jsonb;
  archived_item public.menu_schedule_items;
  source_dish public.dishes;
  source_place public.menu_places;
  source_kind text;
  source_position integer := 0;
begin
  if p_meal_period not in ('breakfast', 'lunch', 'afternoon_tea', 'dinner') then
    raise exception using errcode = '22023', message = 'INVALID_MEAL_PERIOD';
  end if;
  if p_slot_count < 1 or p_slot_count > 12 then
    raise exception using errcode = '22023', message = 'INVALID_SLOT_COUNT';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > p_slot_count then
    raise exception using errcode = '22023', message = 'INVALID_MEAL_ITEMS';
  end if;

  insert into public.menu_schedule_meals (
    uid, meal_date, meal_period, slot_count
  ) values (
    p_uid, p_meal_date, p_meal_period, p_slot_count
  )
  on conflict (uid, meal_date, meal_period)
  do update set slot_count = excluded.slot_count, updated_at = now()
  returning id into target_meal_id;

  for source_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if source_item ? 'archived_item_id' then
      select * into archived_item
      from public.menu_schedule_items
      where id = (source_item->>'archived_item_id')::uuid
        and uid = p_uid
        and meal_id = target_meal_id
        and archived_at is not null;
      if not found then
        raise exception using errcode = 'P0002', message = 'ARCHIVED_ITEM_NOT_FOUND';
      end if;
      resolved_items := resolved_items || jsonb_build_array(
        to_jsonb(archived_item) || jsonb_build_object('is_archived', true)
      );
    else
      resolved_items := resolved_items || jsonb_build_array(
        source_item || jsonb_build_object('is_archived', false)
      );
    end if;
  end loop;

  delete from public.menu_schedule_items
  where meal_id = target_meal_id and uid = p_uid;

  for source_item in select value from jsonb_array_elements(resolved_items)
  loop
    if coalesce((source_item->>'is_archived')::boolean, false) then
      insert into public.menu_schedule_items (
        uid, meal_id, source_kind, record_type, dish_id, place_id,
        snapshot_name, snapshot_place_name, snapshot_image_path,
        snapshot_place_image_path, position, archived_at
      ) values (
        p_uid, target_meal_id, source_item->>'source_kind',
        source_item->>'record_type', null, null,
        source_item->>'snapshot_name', coalesce(source_item->>'snapshot_place_name', ''),
        coalesce(source_item->>'snapshot_image_path', ''),
        coalesce(source_item->>'snapshot_place_image_path', ''),
        source_position, coalesce((source_item->>'archived_at')::timestamptz, now())
      );
    else
      source_kind := source_item->>'source_kind';
      if source_kind = 'dish' then
        select * into source_dish
        from public.dishes
        where id = (source_item->>'dish_id')::uuid
          and uid = p_uid;
        if not found or source_dish.place_id is null then
          raise exception using errcode = 'P0002', message = 'DISH_NOT_FOUND';
        end if;
        select * into source_place
        from public.menu_places
        where id = source_dish.place_id and uid = p_uid;
        if not found then
          raise exception using errcode = 'P0002', message = 'PLACE_NOT_FOUND';
        end if;

        insert into public.menu_schedule_items (
          uid, meal_id, source_kind, record_type, dish_id, place_id,
          snapshot_name, snapshot_place_name, snapshot_image_path,
          snapshot_place_image_path, position, archived_at
        ) values (
          p_uid, target_meal_id, 'dish', source_dish.record_type,
          source_dish.id, source_place.id, source_dish.name,
          case when source_dish.record_type = 'outside' then source_place.name else '' end,
          coalesce(source_dish.image_path, ''),
          case when source_dish.record_type = 'outside' then
            coalesce(source_place.image_path, '')
          else '' end,
          source_position, null
        );
      elsif source_kind = 'place' then
        select * into source_place
        from public.menu_places
        where id = (source_item->>'place_id')::uuid
          and uid = p_uid
          and place_type = 'outside';
        if not found then
          raise exception using errcode = 'P0002', message = 'PLACE_NOT_FOUND';
        end if;

        insert into public.menu_schedule_items (
          uid, meal_id, source_kind, record_type, dish_id, place_id,
          snapshot_name, snapshot_place_name, snapshot_image_path,
          snapshot_place_image_path, position, archived_at
        ) values (
          p_uid, target_meal_id, 'place', 'outside', null, source_place.id,
          source_place.name, source_place.name,
          coalesce(source_place.image_path, ''),
          coalesce(source_place.image_path, ''),
          source_position, null
        );
      else
        raise exception using errcode = '22023', message = 'INVALID_SOURCE_KIND';
      end if;
    end if;
    source_position := source_position + 1;
  end loop;

  return target_meal_id;
end;
$$;

revoke all on function public.replace_menu_schedule_meal(text, date, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_menu_schedule_meal(text, date, text, integer, jsonb)
  to service_role;
