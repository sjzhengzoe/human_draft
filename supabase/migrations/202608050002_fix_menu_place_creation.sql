-- The taste column is a text array after 202608040006. Keep the legacy-store
-- compatibility trigger aligned so creating a new outside store still works.

create or replace function public.sync_menu_place_from_legacy_dish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_type <> 'outside' or new.place_id is not null then
    return new;
  end if;

  insert into public.menu_places (
    id,
    user_id,
    name,
    place_type,
    outside_category_id,
    image_path,
    thumbnail_path,
    sort_order,
    source_dish_id,
    created_at,
    updated_at
  ) values (
    new.id,
    new.user_id,
    new.name,
    'outside',
    new.outside_category_id,
    new.image_path,
    new.thumbnail_path,
    new.sort_order,
    new.id,
    new.created_at,
    new.updated_at
  )
  on conflict (id) do update set
    name = excluded.name,
    outside_category_id = excluded.outside_category_id,
    image_path = excluded.image_path,
    thumbnail_path = excluded.thumbnail_path,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at;

  update public.dishes as child
  set outside_category_id = new.outside_category_id
  where child.user_id = new.user_id
    and child.place_id = new.id
    and child.record_type = 'outside'
    and child.outside_category_id is distinct from new.outside_category_id;

  insert into public.dishes (
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
    place_id,
    place_sort_order
  )
  select
    new.user_id,
    trim(recommended.name),
    'outside',
    null,
    new.outside_category_id,
    '{}',
    '{}',
    '',
    '{}',
    '{}',
    '{}',
    '',
    null,
    new.meal_periods,
    new.id,
    recommended.position::bigint * 1000
  from unnest(new.recommended_items)
    with ordinality as recommended(name, position)
  where trim(recommended.name) <> ''
    and not exists (
      select 1
      from public.dishes as existing
      where existing.user_id = new.user_id
        and existing.place_id = new.id
        and lower(trim(existing.name)) = lower(trim(recommended.name))
    );

  return new;
end;
$$;

revoke all on function public.sync_menu_place_from_legacy_dish() from public;
