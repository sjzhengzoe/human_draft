create table if not exists public.user_footprint_cities (
  user_id uuid not null references public.app_users(id) on delete cascade,
  city_code text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, city_code)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_footprint_cities_city_code_check'
      and conrelid = 'public.user_footprint_cities'::regclass
  ) then
    alter table public.user_footprint_cities
      add constraint user_footprint_cities_city_code_check
      check (city_code ~ '^[0-9]{6}$');
  end if;
end
$$;

create index if not exists user_footprint_cities_user_created_idx
on public.user_footprint_cities(user_id, created_at desc);

alter table public.user_footprint_cities enable row level security;

grant select, insert, delete
on table public.user_footprint_cities
to service_role;

create or replace function public.merge_user_footprint_cities(
  p_user_id uuid,
  p_city_codes text[]
)
returns table(city_code text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(cardinality(p_city_codes), 0) > 340 then
    raise exception using errcode = '22023', message = '足迹城市数量超出范围';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_city_codes, '{}'::text[])) as source(code)
    where source.code !~ '^[0-9]{6}$'
  ) then
    raise exception using errcode = '22023', message = '城市编码无效';
  end if;

  insert into public.user_footprint_cities(user_id, city_code)
  select p_user_id, source.code
  from unnest(coalesce(p_city_codes, '{}'::text[])) as source(code)
  on conflict on constraint user_footprint_cities_pkey do nothing;

  return query
  select item.city_code
  from public.user_footprint_cities as item
  where item.user_id = p_user_id
  order by item.city_code;
end;
$$;

create or replace function public.set_user_footprint_city(
  p_user_id uuid,
  p_city_code text,
  p_visited boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_city_code !~ '^[0-9]{6}$' then
    raise exception using errcode = '22023', message = '城市编码无效';
  end if;
  if p_visited then
    insert into public.user_footprint_cities(user_id, city_code)
    values (p_user_id, p_city_code)
    on conflict on constraint user_footprint_cities_pkey do nothing;
  else
    delete from public.user_footprint_cities
    where user_id = p_user_id and city_code = p_city_code;
  end if;
end;
$$;

revoke all on table public.user_footprint_cities from anon, authenticated;
revoke all on function public.merge_user_footprint_cities(uuid, text[])
from public, anon, authenticated;
revoke all on function public.set_user_footprint_city(uuid, text, boolean)
from public, anon, authenticated;
grant execute on function public.merge_user_footprint_cities(uuid, text[]) to service_role;
grant execute on function public.set_user_footprint_city(uuid, text, boolean) to service_role;
