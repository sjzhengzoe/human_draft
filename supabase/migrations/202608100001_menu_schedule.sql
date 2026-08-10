-- Add date-based menu planning without changing existing dishes or menu places.

create table if not exists public.menu_schedule_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  meal_date date not null,
  meal_period text not null,
  slot_count integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_schedule_meals_id_user_unique unique (id, user_id),
  constraint menu_schedule_meals_user_date_period_unique
    unique (user_id, meal_date, meal_period),
  constraint menu_schedule_meals_period_check
    check (meal_period in ('breakfast', 'lunch', 'afternoon_tea', 'dinner')),
  constraint menu_schedule_meals_slot_count_check
    check (slot_count between 1 and 12)
);

create table if not exists public.menu_schedule_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  meal_id uuid not null,
  source_kind text not null,
  record_type text not null,
  dish_id uuid,
  place_id uuid,
  snapshot_name text not null,
  snapshot_place_name text not null default '',
  snapshot_image_path text not null default '',
  snapshot_place_image_path text not null default '',
  position integer not null,
  created_at timestamptz not null default now(),
  constraint menu_schedule_items_meal_user_fkey
    foreign key (meal_id, user_id)
    references public.menu_schedule_meals(id, user_id)
    on delete cascade,
  constraint menu_schedule_items_source_kind_check
    check (source_kind in ('dish', 'place')),
  constraint menu_schedule_items_record_type_check
    check (record_type in ('home', 'outside')),
  constraint menu_schedule_items_name_check
    check (char_length(trim(snapshot_name)) between 1 and 120),
  constraint menu_schedule_items_position_check
    check (position between 0 and 11),
  constraint menu_schedule_items_meal_position_unique
    unique (meal_id, position)
);

create table if not exists public.menu_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  source_kind text not null,
  dish_id uuid,
  place_id uuid,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint menu_favorites_source_kind_check
    check (source_kind in ('dish', 'place')),
  constraint menu_favorites_source_check check (
    (source_kind = 'dish' and dish_id is not null and place_id is null)
    or
    (source_kind = 'place' and place_id is not null and dish_id is null)
  ),
  constraint menu_favorites_sort_order_check
    check (sort_order between 0 and 99),
  constraint menu_favorites_user_sort_unique unique (user_id, sort_order)
);

alter table public.menu_schedule_items
  add column if not exists snapshot_place_image_path text not null default '';

create unique index if not exists menu_favorites_user_dish_unique
  on public.menu_favorites(user_id, dish_id)
  where source_kind = 'dish';

create unique index if not exists menu_favorites_user_place_unique
  on public.menu_favorites(user_id, place_id)
  where source_kind = 'place';

create index if not exists menu_schedule_meals_user_date_idx
  on public.menu_schedule_meals(user_id, meal_date, meal_period);

create index if not exists menu_schedule_items_user_meal_idx
  on public.menu_schedule_items(user_id, meal_id, position);

alter table public.menu_schedule_meals enable row level security;
alter table public.menu_schedule_items enable row level security;
alter table public.menu_favorites enable row level security;

revoke all on table public.menu_schedule_meals from public, anon, authenticated;
revoke all on table public.menu_schedule_items from public, anon, authenticated;
revoke all on table public.menu_favorites from public, anon, authenticated;
grant select, insert, update, delete on table public.menu_schedule_meals to service_role;
grant select, insert, update, delete on table public.menu_schedule_items to service_role;
grant select, insert, update, delete on table public.menu_favorites to service_role;

drop trigger if exists menu_schedule_meals_set_updated_at on public.menu_schedule_meals;
create trigger menu_schedule_meals_set_updated_at
before update on public.menu_schedule_meals
for each row execute function public.set_updated_at();

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

  delete from public.menu_schedule_items
  where meal_id = target_meal_id and user_id = p_user_id;

  for source_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
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
        snapshot_place_image_path, position
      ) values (
        p_user_id, target_meal_id, 'dish', source_dish.record_type,
        source_dish.id, source_place.id, source_dish.name,
        case when source_dish.record_type = 'outside' then source_place.name else '' end,
        coalesce(nullif(source_dish.thumbnail_path, ''), source_dish.image_path, ''),
        case when source_dish.record_type = 'outside' then
          coalesce(nullif(source_place.thumbnail_path, ''), source_place.image_path, '')
        else '' end,
        source_position
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
        snapshot_place_image_path, position
      ) values (
        p_user_id, target_meal_id, 'place', 'outside', null, source_place.id,
        source_place.name, source_place.name,
        coalesce(nullif(source_place.thumbnail_path, ''), source_place.image_path, ''),
        coalesce(nullif(source_place.thumbnail_path, ''), source_place.image_path, ''),
        source_position
      );
    else
      raise exception using errcode = '22023', message = 'INVALID_SOURCE_KIND';
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

create or replace function public.replace_menu_favorites(
  p_user_id uuid,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  source_item jsonb;
  source_kind text;
  source_position integer := 0;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 100 then
    raise exception using errcode = '22023', message = 'INVALID_FAVORITES';
  end if;

  delete from public.menu_favorites where user_id = p_user_id;
  for source_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    source_kind := source_item->>'source_kind';
    if source_kind = 'dish' then
      if not exists (
        select 1 from public.dishes
        where id = (source_item->>'dish_id')::uuid and user_id = p_user_id
      ) then
        raise exception using errcode = 'P0002', message = 'DISH_NOT_FOUND';
      end if;
      insert into public.menu_favorites (user_id, source_kind, dish_id, sort_order)
      values (p_user_id, 'dish', (source_item->>'dish_id')::uuid, source_position);
    elsif source_kind = 'place' then
      if not exists (
        select 1 from public.menu_places
        where id = (source_item->>'place_id')::uuid
          and user_id = p_user_id and place_type = 'outside'
      ) then
        raise exception using errcode = 'P0002', message = 'PLACE_NOT_FOUND';
      end if;
      insert into public.menu_favorites (user_id, source_kind, place_id, sort_order)
      values (p_user_id, 'place', (source_item->>'place_id')::uuid, source_position);
    else
      raise exception using errcode = '22023', message = 'INVALID_SOURCE_KIND';
    end if;
    source_position := source_position + 1;
  end loop;
  return source_position;
end;
$$;

revoke all on function public.replace_menu_favorites(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_menu_favorites(uuid, jsonb)
  to service_role;
