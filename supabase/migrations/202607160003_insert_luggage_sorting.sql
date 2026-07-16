create or replace function public.move_luggage_group(
  p_source_id uuid,
  p_target_id uuid,
  p_insert_after boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scene_id uuid;
  v_target_scene_id uuid;
  v_ids uuid[];
  v_target_position integer;
begin
  perform pg_advisory_xact_lock(hashtext('move_luggage_group'));
  select scene_id into v_scene_id from public.luggage_groups where id = p_source_id;
  select scene_id into v_target_scene_id from public.luggage_groups where id = p_target_id;
  if v_scene_id is null or v_target_scene_id is null then
    raise exception using errcode = 'P0002', message = '行李层级不存在。';
  end if;
  if v_scene_id <> v_target_scene_id then
    raise exception using errcode = '23514', message = '只能在同一场景内移动层级。';
  end if;
  if p_source_id = p_target_id then return; end if;

  select array_agg(id order by sort_order, id) into v_ids
  from public.luggage_groups where scene_id = v_scene_id and id <> p_source_id;
  select position into v_target_position
  from unnest(v_ids) with ordinality as ordered(id, position)
  where id = p_target_id;
  if p_insert_after then v_target_position := v_target_position + 1; end if;
  v_ids := coalesce(v_ids[1:v_target_position - 1], array[]::uuid[])
    || array[p_source_id]
    || coalesce(v_ids[v_target_position:array_length(v_ids, 1)], array[]::uuid[]);

  update public.luggage_groups as item
  set sort_order = ordered.position
  from unnest(v_ids) with ordinality as ordered(id, position)
  where item.id = ordered.id;
end;
$$;

create or replace function public.move_luggage_item(
  p_source_id uuid,
  p_target_group_id uuid,
  p_target_item_id uuid,
  p_insert_after boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_group_id uuid;
  v_source_scene_id uuid;
  v_target_scene_id uuid;
  v_ids uuid[];
  v_insert_at integer;
begin
  perform pg_advisory_xact_lock(hashtext('move_luggage_item'));
  select i.group_id, g.scene_id into v_source_group_id, v_source_scene_id
  from public.luggage_items i join public.luggage_groups g on g.id = i.group_id
  where i.id = p_source_id;
  select scene_id into v_target_scene_id from public.luggage_groups where id = p_target_group_id;
  if v_source_group_id is null or v_target_scene_id is null then
    raise exception using errcode = 'P0002', message = '行李物品或目标层级不存在。';
  end if;
  if v_source_scene_id <> v_target_scene_id then
    raise exception using errcode = '23514', message = '物品只能在同一场景内移动。';
  end if;
  if p_target_item_id = p_source_id and v_source_group_id = p_target_group_id then return; end if;

  select array_agg(id order by sort_order, id) into v_ids
  from public.luggage_items where group_id = p_target_group_id and id <> p_source_id;
  if p_target_item_id is null then
    v_insert_at := coalesce(array_length(v_ids, 1), 0) + 1;
  else
    select position into v_insert_at
    from unnest(v_ids) with ordinality as ordered(id, position)
    where id = p_target_item_id;
    if v_insert_at is null then
      raise exception using errcode = '23514', message = '目标物品不在目标层级中。';
    end if;
    if p_insert_after then v_insert_at := v_insert_at + 1; end if;
  end if;

  v_ids := coalesce(v_ids[1:v_insert_at - 1], array[]::uuid[])
    || array[p_source_id]
    || coalesce(v_ids[v_insert_at:array_length(v_ids, 1)], array[]::uuid[]);

  update public.luggage_items as item
  set group_id = p_target_group_id, sort_order = ordered.position * 1000
  from unnest(v_ids) with ordinality as ordered(id, position)
  where item.id = ordered.id;

  if v_source_group_id <> p_target_group_id then
    with remaining as (
      select id, row_number() over (order by sort_order, id) as position
      from public.luggage_items where group_id = v_source_group_id
    )
    update public.luggage_items as item
    set sort_order = remaining.position * 1000
    from remaining where item.id = remaining.id;
  end if;
end;
$$;

revoke all on function public.move_luggage_group(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.move_luggage_group(uuid, uuid, boolean) to service_role;
revoke all on function public.move_luggage_item(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.move_luggage_item(uuid, uuid, uuid, boolean) to service_role;
