create table if not exists public.user_footprint_city_places (
  id uuid primary key default gen_random_uuid(),
  uid text not null references public.app_users(uid) on delete cascade,
  city_code text not null,
  name text not null,
  note text not null default '',
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_footprint_city_places_city_code_check
    check (city_code ~ '^[0-9]{6}$'),
  constraint user_footprint_city_places_name_check
    check (char_length(btrim(name)) between 1 and 80),
  constraint user_footprint_city_places_note_check
    check (char_length(note) <= 120),
  constraint user_footprint_city_places_status_check
    check (status in ('planned', 'visited'))
);

create index if not exists user_footprint_city_places_city_status_idx
on public.user_footprint_city_places(uid, city_code, status, updated_at desc);

alter table public.user_footprint_city_places enable row level security;

revoke all on table public.user_footprint_city_places
from public, anon, authenticated;

grant select, insert, update, delete
on table public.user_footprint_city_places
to service_role;

drop trigger if exists user_footprint_city_places_set_updated_at
on public.user_footprint_city_places;

create trigger user_footprint_city_places_set_updated_at
before update on public.user_footprint_city_places
for each row execute function public.set_updated_at();
