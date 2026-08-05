-- Allow outside stores in the same category to be reordered independently.

create or replace function public.reorder_menu_places(
  p_user_id uuid,
  p_place_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_count integer;
  actual_count integer;
  category_count integer;
  target_category_id uuid;
begin
  expected_count := coalesce(array_length(p_place_ids, 1), 0);

  select
    count(*),
    count(distinct outside_category_id),
    min(outside_category_id::text)::uuid
  into actual_count, category_count, target_category_id
  from public.menu_places
  where user_id = p_user_id
    and place_type = 'outside'
    and id = any(p_place_ids);

  if expected_count = 0
    or expected_count <> actual_count
    or category_count <> 1
  then
    raise exception using errcode = '22023', message = '排序列表包含不存在或不同分类的店铺';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'menu-places:' || p_user_id::text || ':' || target_category_id::text,
      0
    )
  );

  with desired as (
    select id, position::bigint
    from unnest(p_place_ids) with ordinality as row(id, position)
    union all
    select
      id,
      expected_count + row_number() over (
        order by sort_order, created_at desc, id
      )
    from public.menu_places
    where user_id = p_user_id
      and place_type = 'outside'
      and outside_category_id = target_category_id
      and not (id = any(p_place_ids))
  )
  update public.menu_places as place
  set sort_order = desired.position * 1000
  from desired
  where place.id = desired.id
    and place.user_id = p_user_id
    and place.place_type = 'outside'
    and place.outside_category_id = target_category_id;
end;
$$;

revoke all on function public.reorder_menu_places(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.reorder_menu_places(uuid, uuid[])
  to service_role;
