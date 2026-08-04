-- Keep the existing manual dish ordering, but make the initial/default order newest-first.
-- Existing rows are re-ranked once. Future inserts receive a sort_order before the
-- current first row, regardless of which application entry point creates them.

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.dishes'::regclass
      and tgname = 'dishes_set_newest_first_sort_order'
      and not tgisinternal
  ) then
    perform pg_advisory_xact_lock(
      hashtextextended('public.dishes:newest-first-backfill', 0)
    );
    set constraints dishes_user_sort_order_unique deferred;

    with ranked as (
      select
        id,
        user_id,
        row_number() over (
          partition by user_id
          order by created_at desc, id desc
        )::bigint * 1000 as next_sort_order
      from public.dishes
    )
    update public.dishes as dish
    set sort_order = ranked.next_sort_order
    from ranked
    where dish.id = ranked.id
      and dish.user_id = ranked.user_id;
  end if;
end;
$$;

create or replace function public.set_dish_newest_first_sort_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('dishes:' || new.user_id::text, 0)
  );

  select coalesce(min(sort_order) - 1000, 1000)
  into new.sort_order
  from public.dishes
  where user_id = new.user_id;

  return new;
end;
$$;

revoke all on function public.set_dish_newest_first_sort_order() from public;

drop trigger if exists dishes_set_newest_first_sort_order on public.dishes;
create trigger dishes_set_newest_first_sort_order
before insert on public.dishes
for each row
execute function public.set_dish_newest_first_sort_order();
