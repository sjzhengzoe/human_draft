create table if not exists public.key_moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 2000),
  occurred_at timestamptz not null,
  image_path text,
  thumbnail_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint key_moments_has_content check (
    char_length(btrim(content)) > 0 or image_path is not null
  )
);

create index if not exists key_moments_user_occurred_idx
on public.key_moments(user_id, occurred_at desc, created_at desc);

drop trigger if exists key_moments_set_updated_at on public.key_moments;
create trigger key_moments_set_updated_at
before update on public.key_moments
for each row execute function public.set_updated_at();

alter table public.key_moments enable row level security;

grant select, insert, update, delete
on table public.key_moments
to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'key-moment-images',
  'key-moment-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
