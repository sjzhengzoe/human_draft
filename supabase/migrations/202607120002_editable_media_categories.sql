create table if not exists public.media_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 40),
  sort_order bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_categories_sort_order_unique unique (sort_order)
    deferrable initially immediate
);

insert into public.media_categories (name, sort_order)
values
  ('电影', 1000),
  ('电视剧', 2000),
  ('动漫', 3000),
  ('动画', 4000),
  ('广播剧', 5000),
  ('小说', 6000)
on conflict (name) do nothing;

alter table public.media_entries
drop constraint if exists media_entries_media_type_check;

alter table public.media_entries
drop constraint if exists media_entries_media_type_fkey;

alter table public.media_entries
add constraint media_entries_media_type_fkey
foreign key (media_type) references public.media_categories(name)
on update cascade on delete restrict;

alter table public.media_entries
drop constraint if exists media_entries_platforms_valid;

alter table public.media_entries
add constraint media_entries_platforms_valid check (
  platforms <@ array[
    '腾讯视频', '爱奇艺', '哔哩哔哩', '夸克', '优酷', '芒果 TV', '猫耳', '漫播'
  ]::text[]
  and public.text_array_has_unique_values(platforms)
);

drop trigger if exists media_categories_set_updated_at on public.media_categories;
create trigger media_categories_set_updated_at
before update on public.media_categories
for each row execute function public.set_updated_at();

create or replace function public.create_media_category_at_end(p_name text)
returns setof public.media_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  next_order bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('public.media_categories:sort_order', 0));
  select coalesce(max(sort_order), 0) + 1000 into next_order from public.media_categories;
  return query
  insert into public.media_categories (name, sort_order)
  values (p_name, next_order)
  returning *;
end;
$$;

create or replace function public.swap_media_category_sort_orders(
  p_source_id uuid,
  p_target_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  source_order bigint;
  target_order bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('public.media_categories:sort_order', 0));
  select sort_order into source_order from public.media_categories where id = p_source_id;
  select sort_order into target_order from public.media_categories where id = p_target_id;
  if source_order is null or target_order is null then
    raise exception using errcode = 'P0002', message = '影视分类不存在';
  end if;
  set constraints media_categories_sort_order_unique deferred;
  update public.media_categories
  set sort_order = case id
    when p_source_id then target_order
    when p_target_id then source_order
  end
  where id in (p_source_id, p_target_id);
end;
$$;

alter table public.media_categories enable row level security;
revoke all on public.media_categories from anon, authenticated;
revoke all on function public.create_media_category_at_end(text) from public, anon, authenticated;
revoke all on function public.swap_media_category_sort_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_media_category_at_end(text) to service_role;
grant execute on function public.swap_media_category_sort_orders(uuid, uuid) to service_role;
