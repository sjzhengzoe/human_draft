-- Read active menu sources live, and preserve independent snapshots only when
-- a referenced dish or place is deleted.

alter table public.menu_schedule_items
  add column if not exists archived_at timestamptz;

create index if not exists menu_schedule_items_user_dish_reference_idx
  on public.menu_schedule_items(user_id, dish_id)
  where dish_id is not null;

create index if not exists menu_schedule_items_user_place_reference_idx
  on public.menu_schedule_items(user_id, place_id)
  where place_id is not null;

create or replace function public.archive_and_delete_menu_dish(
  p_user_id uuid,
  p_dish_id uuid,
  p_archive_image_path text,
  p_archive_place_image_path text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  source_dish public.dishes;
  source_place public.menu_places;
  archived_count integer := 0;
begin
  select * into source_dish
  from public.dishes
  where id = p_dish_id and user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'DISH_NOT_FOUND';
  end if;

  if source_dish.place_id is not null then
    select * into source_place
    from public.menu_places
    where id = source_dish.place_id and user_id = p_user_id;
  end if;

  update public.menu_schedule_items
  set
    record_type = source_dish.record_type,
    snapshot_name = source_dish.name,
    snapshot_place_name = case
      when source_dish.record_type = 'outside' then coalesce(source_place.name, '')
      else ''
    end,
    snapshot_image_path = coalesce(p_archive_image_path, ''),
    snapshot_place_image_path = case
      when source_dish.record_type = 'outside' then coalesce(p_archive_place_image_path, '')
      else ''
    end,
    dish_id = null,
    place_id = null,
    archived_at = now()
  where user_id = p_user_id
    and source_kind = 'dish'
    and dish_id = p_dish_id;
  get diagnostics archived_count = row_count;

  delete from public.menu_favorites
  where user_id = p_user_id
    and source_kind = 'dish'
    and dish_id = p_dish_id;

  delete from public.dishes
  where id = p_dish_id and user_id = p_user_id;

  return archived_count;
end;
$$;

revoke all on function public.archive_and_delete_menu_dish(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.archive_and_delete_menu_dish(uuid, uuid, text, text)
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
  select * into source_place
  from public.menu_places
  where id = p_place_id and user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PLACE_NOT_FOUND';
  end if;
  if source_place.place_type <> 'outside' then
    raise exception using errcode = '22023', message = 'HOME_PLACE_READ_ONLY';
  end if;
  if jsonb_typeof(coalesce(p_dish_archives, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_DISH_ARCHIVES';
  end if;

  with dish_archives as (
    select archive.dish_id, coalesce(archive.archive_image_path, '') as archive_image_path
    from jsonb_to_recordset(coalesce(p_dish_archives, '[]'::jsonb))
      as archive(dish_id uuid, archive_image_path text)
  )
  update public.menu_schedule_items as item
  set
    record_type = dish.record_type,
    snapshot_name = dish.name,
    snapshot_place_name = source_place.name,
    snapshot_image_path = coalesce(archive.archive_image_path, ''),
    snapshot_place_image_path = coalesce(p_place_archive_image_path, ''),
    dish_id = null,
    place_id = null,
    archived_at = now()
  from public.dishes as dish
  left join dish_archives as archive on archive.dish_id = dish.id
  where item.user_id = p_user_id
    and item.source_kind = 'dish'
    and item.dish_id = dish.id
    and dish.user_id = p_user_id
    and dish.place_id = p_place_id;
  get diagnostics changed_count = row_count;
  archived_count := archived_count + changed_count;

  if source_place.source_dish_id is not null then
    update public.menu_schedule_items
    set
      record_type = 'outside',
      snapshot_name = source_place.name,
      snapshot_place_name = source_place.name,
      snapshot_image_path = coalesce(p_place_archive_image_path, ''),
      snapshot_place_image_path = coalesce(p_place_archive_image_path, ''),
      dish_id = null,
      place_id = null,
      archived_at = now()
    where user_id = p_user_id
      and source_kind = 'dish'
      and dish_id = source_place.source_dish_id;
    get diagnostics changed_count = row_count;
    archived_count := archived_count + changed_count;
  end if;

  update public.menu_schedule_items
  set
    record_type = 'outside',
    snapshot_name = source_place.name,
    snapshot_place_name = source_place.name,
    snapshot_image_path = coalesce(p_place_archive_image_path, ''),
    snapshot_place_image_path = coalesce(p_place_archive_image_path, ''),
    dish_id = null,
    place_id = null,
    archived_at = now()
  where user_id = p_user_id
    and source_kind = 'place'
    and place_id = p_place_id;
  get diagnostics changed_count = row_count;
  archived_count := archived_count + changed_count;

  delete from public.menu_favorites
  where user_id = p_user_id
    and (
      (source_kind = 'place' and place_id = p_place_id)
      or (
        source_kind = 'dish'
        and dish_id in (
          select id from public.dishes
          where user_id = p_user_id and place_id = p_place_id
          union all
          select source_place.source_dish_id
          where source_place.source_dish_id is not null
        )
      )
    );

  if source_place.source_dish_id is not null then
    delete from public.dishes
    where id = source_place.source_dish_id and user_id = p_user_id;
  else
    delete from public.menu_places
    where id = p_place_id and user_id = p_user_id;
  end if;

  return archived_count;
end;
$$;

revoke all on function public.archive_and_delete_menu_place(uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.archive_and_delete_menu_place(uuid, uuid, jsonb, text)
  to service_role;

create or replace function public.replace_menu_schedule_meal(
  p_user_id uuid,
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
    user_id, meal_date, meal_period, slot_count
  ) values (
    p_user_id, p_meal_date, p_meal_period, p_slot_count
  )
  on conflict (user_id, meal_date, meal_period)
  do update set slot_count = excluded.slot_count, updated_at = now()
  returning id into target_meal_id;

  for source_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if source_item ? 'archived_item_id' then
      select * into archived_item
      from public.menu_schedule_items
      where id = (source_item->>'archived_item_id')::uuid
        and user_id = p_user_id
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
  where meal_id = target_meal_id and user_id = p_user_id;

  for source_item in select value from jsonb_array_elements(resolved_items)
  loop
    if coalesce((source_item->>'is_archived')::boolean, false) then
      insert into public.menu_schedule_items (
        user_id, meal_id, source_kind, record_type, dish_id, place_id,
        snapshot_name, snapshot_place_name, snapshot_image_path,
        snapshot_place_image_path, position, archived_at
      ) values (
        p_user_id, target_meal_id, source_item->>'source_kind',
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
          and user_id = p_user_id;
        if not found or source_dish.place_id is null then
          raise exception using errcode = 'P0002', message = 'DISH_NOT_FOUND';
        end if;
        select * into source_place
        from public.menu_places
        where id = source_dish.place_id and user_id = p_user_id;
        if not found then
          raise exception using errcode = 'P0002', message = 'PLACE_NOT_FOUND';
        end if;

        insert into public.menu_schedule_items (
          user_id, meal_id, source_kind, record_type, dish_id, place_id,
          snapshot_name, snapshot_place_name, snapshot_image_path,
          snapshot_place_image_path, position, archived_at
        ) values (
          p_user_id, target_meal_id, 'dish', source_dish.record_type,
          source_dish.id, source_place.id, source_dish.name,
          case when source_dish.record_type = 'outside' then source_place.name else '' end,
          coalesce(nullif(source_dish.thumbnail_path, ''), source_dish.image_path, ''),
          case when source_dish.record_type = 'outside' then
            coalesce(nullif(source_place.thumbnail_path, ''), source_place.image_path, '')
          else '' end,
          source_position, null
        );
      elsif source_kind = 'place' then
        select * into source_place
        from public.menu_places
        where id = (source_item->>'place_id')::uuid
          and user_id = p_user_id
          and place_type = 'outside';
        if not found then
          raise exception using errcode = 'P0002', message = 'PLACE_NOT_FOUND';
        end if;

        insert into public.menu_schedule_items (
          user_id, meal_id, source_kind, record_type, dish_id, place_id,
          snapshot_name, snapshot_place_name, snapshot_image_path,
          snapshot_place_image_path, position, archived_at
        ) values (
          p_user_id, target_meal_id, 'place', 'outside', null, source_place.id,
          source_place.name, source_place.name,
          coalesce(nullif(source_place.thumbnail_path, ''), source_place.image_path, ''),
          coalesce(nullif(source_place.thumbnail_path, ''), source_place.image_path, ''),
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

revoke all on function public.replace_menu_schedule_meal(uuid, date, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_menu_schedule_meal(uuid, date, text, integer, jsonb)
  to service_role;
