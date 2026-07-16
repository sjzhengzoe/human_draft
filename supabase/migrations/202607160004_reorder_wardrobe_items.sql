create or replace function public.reorder_wardrobe_items(
  p_user_id uuid,
  p_item_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected integer;
  v_actual integer;
begin
  v_expected := coalesce(array_length(p_item_ids, 1), 0);
  select count(*) into v_actual from public.wardrobe_items
  where user_id = p_user_id and id = any(p_item_ids);
  if v_expected = 0 or v_expected <> v_actual then
    raise exception using errcode = '22023', message = '衣物排序列表无效。';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('public.wardrobe_items:sort_order:' || p_user_id::text, 0));
  set constraints wardrobe_items_user_sort_unique deferred;

  with requested as (
    select ordered.id, ordered.position::bigint as position
    from unnest(p_item_ids) with ordinality as ordered(id, position)
  ), remaining as (
    select item.id, v_expected::bigint + row_number() over (order by item.sort_order, item.id) as position
    from public.wardrobe_items item
    where item.user_id = p_user_id and not (item.id = any(p_item_ids))
  ), desired as (
    select * from requested union all select * from remaining
  )
  update public.wardrobe_items item
  set sort_order = desired.position * 1000
  from desired where item.id = desired.id and item.user_id = p_user_id;
end;
$$;

revoke all on function public.reorder_wardrobe_items(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_wardrobe_items(uuid, uuid[]) to service_role;
