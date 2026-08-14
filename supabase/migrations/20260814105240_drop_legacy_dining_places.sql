do $$
begin
  if to_regclass('public.dining_places') is null then
    return;
  end if;

  if exists (
    select 1
    from public.dining_places as legacy
    where not exists (
      select 1
      from public.dishes as dish
      join public.menu_places as place
        on place.source_dish_id = dish.id
       and place.user_id = dish.user_id
      where dish.source_dining_place_id = legacy.id
        and dish.user_id = legacy.user_id
    )
  ) then
    raise exception 'dining_places cleanup aborted: unmigrated rows remain';
  end if;
end
$$;

drop table if exists public.dining_places;

alter table public.dishes
  drop column if exists source_dining_place_id;
