-- Store the home-module visibility preference once per application account.
-- The mini program reaches this table only through the authenticated server API.

create table if not exists public.user_home_module_settings (
  uid text primary key
    references public.app_users(uid) on delete cascade,
  hidden_module_keys text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  constraint user_home_module_settings_known_keys_check
    check (
      hidden_module_keys <@ array[
        'menu',
        'media',
        'activities',
        'chat-topics',
        'text-card',
        'exercise',
        'luggage',
        'wardrobe',
        'key-moments',
        'footprint'
      ]::text[]
    ),
  constraint user_home_module_settings_visible_item_check
    check (cardinality(hidden_module_keys) < 10)
);

alter table public.user_home_module_settings enable row level security;

revoke all privileges on table public.user_home_module_settings
  from public, anon, authenticated;
grant select, insert, update, delete on table public.user_home_module_settings
  to service_role;

drop trigger if exists user_home_module_settings_set_updated_at
  on public.user_home_module_settings;
create trigger user_home_module_settings_set_updated_at
before update on public.user_home_module_settings
for each row execute function public.set_updated_at();
