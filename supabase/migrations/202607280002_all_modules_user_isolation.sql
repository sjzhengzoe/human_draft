-- Convert every previously shared application module to per-user ownership.
-- Existing shared rows belong to the explicitly confirmed WeChat account.

do $$
declare
  owner_id uuid;
begin
  select id into owner_id
  from public.app_users
  where wechat_openid = 'oCaBp3b0npjUNGOt9wD2lw5c5vZQ';

  if owner_id is null then
    raise exception 'Existing-data owner WeChat account was not found';
  end if;

  alter table public.categories add column if not exists user_id uuid;
  alter table public.dishes add column if not exists user_id uuid;
  alter table public.media_categories add column if not exists user_id uuid;
  alter table public.media_entries add column if not exists user_id uuid;
  alter table public.media_seasons add column if not exists user_id uuid;
  alter table public.media_episodes add column if not exists user_id uuid;
  alter table public.activity_items add column if not exists user_id uuid;
  alter table public.luggage_scenes add column if not exists user_id uuid;
  alter table public.luggage_groups add column if not exists user_id uuid;
  alter table public.luggage_items add column if not exists user_id uuid;
  alter table public.dining_scenes add column if not exists user_id uuid;
  alter table public.dining_places add column if not exists user_id uuid;

  update public.categories set user_id = owner_id where user_id is null;
  update public.dishes as item
  set user_id = category.user_id
  from public.categories as category
  where item.category_id = category.id and item.user_id is null;

  update public.media_categories set user_id = owner_id where user_id is null;
  update public.media_entries set user_id = owner_id where user_id is null;
  update public.media_seasons as season
  set user_id = entry.user_id
  from public.media_entries as entry
  where season.media_entry_id = entry.id and season.user_id is null;
  update public.media_episodes as episode
  set user_id = season.user_id
  from public.media_seasons as season
  where episode.season_id = season.id and episode.user_id is null;

  update public.activity_items set user_id = owner_id where user_id is null;
  update public.luggage_scenes set user_id = owner_id where user_id is null;
  update public.luggage_groups as item
  set user_id = scene.user_id
  from public.luggage_scenes as scene
  where item.scene_id = scene.id and item.user_id is null;
  update public.luggage_items as item
  set user_id = parent.user_id
  from public.luggage_groups as parent
  where item.group_id = parent.id and item.user_id is null;

  update public.dining_scenes set user_id = owner_id where user_id is null;
  update public.dining_places as item
  set user_id = scene.user_id
  from public.dining_scenes as scene
  where item.scene_id = scene.id and item.user_id is null;
end;
$$;

alter table public.categories alter column user_id set not null;
alter table public.dishes alter column user_id set not null;
alter table public.media_categories alter column user_id set not null;
alter table public.media_entries alter column user_id set not null;
alter table public.media_seasons alter column user_id set not null;
alter table public.media_episodes alter column user_id set not null;
alter table public.activity_items alter column user_id set not null;
alter table public.luggage_scenes alter column user_id set not null;
alter table public.luggage_groups alter column user_id set not null;
alter table public.luggage_items alter column user_id set not null;
alter table public.dining_scenes alter column user_id set not null;
alter table public.dining_places alter column user_id set not null;

alter table public.categories drop constraint if exists categories_name_key;
alter table public.categories
  add constraint categories_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade,
  add constraint categories_id_user_unique unique (id, user_id),
  add constraint categories_user_name_unique unique (user_id, name);

alter table public.dishes drop constraint if exists dishes_category_id_fkey;
alter table public.dishes drop constraint if exists dishes_sort_order_unique;
alter table public.dishes
  add constraint dishes_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade,
  add constraint dishes_category_user_fkey foreign key (category_id, user_id)
    references public.categories(id, user_id) on delete restrict,
  add constraint dishes_user_sort_order_unique unique (user_id, sort_order)
    deferrable initially immediate;

alter table public.media_entries drop constraint if exists media_entries_media_type_fkey;
alter table public.media_categories drop constraint if exists media_categories_name_key;
alter table public.media_categories drop constraint if exists media_categories_sort_order_unique;
alter table public.media_categories
  add constraint media_categories_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade,
  add constraint media_categories_id_user_unique unique (id, user_id),
  add constraint media_categories_user_name_unique unique (user_id, name),
  add constraint media_categories_user_sort_unique unique (user_id, sort_order)
    deferrable initially immediate;

alter table public.media_entries drop constraint if exists media_entries_type_sort_order_unique;
drop index if exists public.media_entries_type_title_unique;
alter table public.media_entries
  add constraint media_entries_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade,
  add constraint media_entries_id_user_unique unique (id, user_id),
  add constraint media_entries_category_user_fkey foreign key (user_id, media_type)
    references public.media_categories(user_id, name) on update cascade on delete restrict,
  add constraint media_entries_user_type_sort_unique unique (user_id, media_type, sort_order)
    deferrable initially immediate;
create unique index media_entries_user_type_title_unique
  on public.media_entries(user_id, media_type, lower(btrim(title)));

alter table public.media_seasons drop constraint if exists media_seasons_media_entry_id_fkey;
alter table public.media_seasons
  add constraint media_seasons_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade,
  add constraint media_seasons_id_user_unique unique (id, user_id),
  add constraint media_seasons_entry_user_fkey foreign key (media_entry_id, user_id)
    references public.media_entries(id, user_id) on delete cascade;

alter table public.media_episodes drop constraint if exists media_episodes_season_id_fkey;
alter table public.media_episodes
  add constraint media_episodes_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade,
  add constraint media_episodes_season_user_fkey foreign key (season_id, user_id)
    references public.media_seasons(id, user_id) on delete cascade;

alter table public.activity_items
  add constraint activity_items_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade;

alter table public.luggage_scenes drop constraint if exists luggage_scenes_name_key;
alter table public.luggage_scenes
  add constraint luggage_scenes_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade,
  add constraint luggage_scenes_id_user_unique unique (id, user_id),
  add constraint luggage_scenes_user_name_unique unique (user_id, name);

alter table public.luggage_groups drop constraint if exists luggage_groups_scene_id_fkey;
alter table public.luggage_groups
  add constraint luggage_groups_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade,
  add constraint luggage_groups_id_user_unique unique (id, user_id),
  add constraint luggage_groups_scene_user_fkey foreign key (scene_id, user_id)
    references public.luggage_scenes(id, user_id) on delete cascade;

alter table public.luggage_items drop constraint if exists luggage_items_group_id_fkey;
alter table public.luggage_items
  add constraint luggage_items_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade,
  add constraint luggage_items_group_user_fkey foreign key (group_id, user_id)
    references public.luggage_groups(id, user_id) on delete cascade;

alter table public.dining_scenes drop constraint if exists dining_scenes_name_key;
alter table public.dining_scenes drop constraint if exists dining_scenes_sort_order_unique;
alter table public.dining_scenes
  add constraint dining_scenes_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade,
  add constraint dining_scenes_id_user_unique unique (id, user_id),
  add constraint dining_scenes_user_name_unique unique (user_id, name),
  add constraint dining_scenes_user_sort_unique unique (user_id, sort_order)
    deferrable initially immediate;

alter table public.dining_places drop constraint if exists dining_places_scene_id_fkey;
alter table public.dining_places
  add constraint dining_places_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade,
  add constraint dining_places_scene_user_fkey foreign key (scene_id, user_id)
    references public.dining_scenes(id, user_id) on delete restrict;

create index if not exists categories_user_sort_idx on public.categories(user_id, sort_order);
create index if not exists dishes_user_created_idx on public.dishes(user_id, created_at desc);
create index if not exists media_entries_user_status_idx on public.media_entries(user_id, watch_status);
create index if not exists media_episodes_user_favorite_idx on public.media_episodes(user_id, updated_at desc) where is_favorite;
create index if not exists activity_items_user_type_sort_idx on public.activity_items(user_id, activity_type, sort_order);
create index if not exists luggage_scenes_user_sort_idx on public.luggage_scenes(user_id, sort_order);
create index if not exists luggage_groups_user_scene_sort_idx on public.luggage_groups(user_id, scene_id, sort_order);
create index if not exists luggage_items_user_group_sort_idx on public.luggage_items(user_id, group_id, sort_order);
create index if not exists dining_places_user_scene_sort_idx on public.dining_places(user_id, scene_id, sort_order);

create or replace function public.ensure_user_defaults(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.app_users where id = p_user_id) then
    raise exception using errcode = 'P0002', message = '账号不存在';
  end if;

  if not exists (select 1 from public.categories where user_id = p_user_id) then
    insert into public.categories(user_id, name, sort_order)
    values
      (p_user_id, '荤菜', 1000), (p_user_id, '半荤', 2000),
      (p_user_id, '素菜', 3000), (p_user_id, '主食', 4000),
      (p_user_id, '水果', 5000), (p_user_id, '外食', 6000),
      (p_user_id, '甜品', 7000), (p_user_id, '饮品', 8000);
  end if;

  if not exists (select 1 from public.media_categories where user_id = p_user_id) then
    insert into public.media_categories(user_id, name, sort_order)
    values
      (p_user_id, '电影', 1000), (p_user_id, '电视剧', 2000),
      (p_user_id, '动漫', 3000), (p_user_id, '动画', 4000),
      (p_user_id, '广播剧', 5000), (p_user_id, '小说', 6000);
  end if;

  if not exists (select 1 from public.dining_scenes where user_id = p_user_id) then
    insert into public.dining_scenes(user_id, name, sort_order)
    values (p_user_id, '日常', 1000);
  end if;
end;
$$;

select public.ensure_user_defaults(id) from public.app_users;

create or replace function public.create_dish_at_end(
  p_user_id uuid,
  p_id uuid,
  p_name text,
  p_category_id uuid,
  p_image_path text,
  p_thumbnail_path text
)
returns setof public.dishes
language plpgsql security definer set search_path = public
as $$
declare next_order bigint;
begin
  if not exists (
    select 1 from public.categories where id = p_category_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = '分类不存在';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dishes:' || p_user_id::text, 0));
  select coalesce(max(sort_order), 0) + 1000 into next_order
  from public.dishes where user_id = p_user_id;
  return query insert into public.dishes(
    id, user_id, name, category_id, image_path, thumbnail_path, sort_order
  ) values (
    p_id, p_user_id, p_name, p_category_id, p_image_path, p_thumbnail_path, next_order
  ) returning *;
end;
$$;

create or replace function public.reorder_dishes(p_user_id uuid, p_dish_ids uuid[])
returns void language plpgsql security definer set search_path = public
as $$
declare expected_count integer; actual_count integer;
begin
  expected_count := coalesce(array_length(p_dish_ids, 1), 0);
  select count(*) into actual_count from public.dishes
  where user_id = p_user_id and id = any(p_dish_ids);
  if expected_count = 0 or expected_count <> actual_count then
    raise exception using errcode = '22023', message = '排序列表包含不存在的菜品';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dishes:' || p_user_id::text, 0));
  set constraints dishes_user_sort_order_unique deferred;
  with desired as (
    select id, position::bigint from unnest(p_dish_ids) with ordinality as row(id, position)
    union all
    select id, expected_count + row_number() over(order by sort_order, created_at desc, id)
    from public.dishes
    where user_id = p_user_id and not (id = any(p_dish_ids))
  )
  update public.dishes as dish set sort_order = desired.position * 1000
  from desired where dish.id = desired.id and dish.user_id = p_user_id;
end;
$$;

create or replace function public.swap_dish_sort_orders(
  p_user_id uuid, p_source_id uuid, p_target_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
declare source_order bigint; target_order bigint;
begin
  select sort_order into source_order from public.dishes
  where id = p_source_id and user_id = p_user_id for update;
  select sort_order into target_order from public.dishes
  where id = p_target_id and user_id = p_user_id for update;
  if source_order is null or target_order is null or p_source_id = p_target_id then
    raise exception using errcode = 'P0002', message = '交换位置的菜品不存在';
  end if;
  set constraints dishes_user_sort_order_unique deferred;
  update public.dishes set sort_order = case id
    when p_source_id then target_order when p_target_id then source_order end
  where user_id = p_user_id and id = any(array[p_source_id, p_target_id]);
end;
$$;

create or replace function public.create_media_entry_at_end(
  p_user_id uuid,
  p_title text,
  p_media_type text,
  p_watch_status text,
  p_platforms text[]
)
returns setof public.media_entries
language plpgsql security definer set search_path = public
as $$
declare next_order bigint;
begin
  if not exists (
    select 1 from public.media_categories
    where user_id = p_user_id and name = p_media_type
  ) then
    raise exception using errcode = 'P0002', message = '影视分类不存在';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('media:' || p_user_id::text, 0));
  select coalesce(max(sort_order), 0) + 1000 into next_order
  from public.media_entries where user_id = p_user_id and media_type = p_media_type;
  return query insert into public.media_entries(
    user_id, title, media_type, watch_status, platforms, sort_order
  ) values (
    p_user_id, p_title, p_media_type, p_watch_status, p_platforms, next_order
  ) returning *;
end;
$$;

create or replace function public.move_media_entry_to_type_at_end(
  p_user_id uuid,
  p_entry_id uuid,
  p_title text,
  p_media_type text,
  p_watch_status text,
  p_platforms text[]
)
returns setof public.media_entries
language plpgsql security definer set search_path = public
as $$
declare current_type text; next_order bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('media:' || p_user_id::text, 0));
  select media_type into current_type from public.media_entries
  where id = p_entry_id and user_id = p_user_id for update;
  if current_type is null then
    raise exception using errcode = 'P0002', message = '影视条目不存在';
  end if;
  if not exists (
    select 1 from public.media_categories
    where user_id = p_user_id and name = p_media_type
  ) then
    raise exception using errcode = 'P0002', message = '影视分类不存在';
  end if;
  if current_type = p_media_type then
    return query update public.media_entries as entry
    set title = coalesce(p_title, entry.title),
        watch_status = coalesce(p_watch_status, entry.watch_status),
        platforms = coalesce(p_platforms, entry.platforms)
    where entry.id = p_entry_id and entry.user_id = p_user_id returning entry.*;
    return;
  end if;
  select coalesce(max(sort_order), 0) + 1000 into next_order
  from public.media_entries where user_id = p_user_id and media_type = p_media_type;
  return query update public.media_entries as entry
  set title = coalesce(p_title, entry.title), media_type = p_media_type,
      watch_status = coalesce(p_watch_status, entry.watch_status),
      platforms = coalesce(p_platforms, entry.platforms), sort_order = next_order
  where entry.id = p_entry_id and entry.user_id = p_user_id returning entry.*;
end;
$$;

create or replace function public.reorder_media_entries(
  p_user_id uuid, p_media_type text, p_entry_ids uuid[]
)
returns void language plpgsql security definer set search_path = public
as $$
declare expected_count integer; actual_count integer;
begin
  expected_count := coalesce(array_length(p_entry_ids, 1), 0);
  select count(*) into actual_count from public.media_entries
  where user_id = p_user_id and media_type = p_media_type and id = any(p_entry_ids);
  if expected_count = 0 or expected_count <> actual_count then
    raise exception using errcode = '22023', message = '排序列表包含不存在或分类不一致的影视条目';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('media:' || p_user_id::text, 0));
  set constraints media_entries_user_type_sort_unique deferred;
  with desired as (
    select id, position::bigint from unnest(p_entry_ids) with ordinality as row(id, position)
    union all
    select id, expected_count + row_number() over(order by sort_order, created_at desc, id)
    from public.media_entries
    where user_id = p_user_id and media_type = p_media_type
      and not (id = any(p_entry_ids))
  )
  update public.media_entries as entry set sort_order = desired.position * 1000
  from desired
  where entry.id = desired.id and entry.user_id = p_user_id
    and entry.media_type = p_media_type;
end;
$$;

create or replace function public.swap_media_entry_sort_orders(
  p_user_id uuid, p_source_id uuid, p_target_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
declare source_order bigint; target_order bigint; source_type text; target_type text;
begin
  select sort_order, media_type into source_order, source_type from public.media_entries
  where id = p_source_id and user_id = p_user_id for update;
  select sort_order, media_type into target_order, target_type from public.media_entries
  where id = p_target_id and user_id = p_user_id for update;
  if source_order is null or target_order is null or p_source_id = p_target_id then
    raise exception using errcode = 'P0002', message = '交换位置的影视条目不存在';
  end if;
  if source_type <> target_type then
    raise exception using errcode = '22023', message = '只能交换同一分类下的影视条目';
  end if;
  set constraints media_entries_user_type_sort_unique deferred;
  update public.media_entries set sort_order = case id
    when p_source_id then target_order when p_target_id then source_order end
  where user_id = p_user_id and id = any(array[p_source_id, p_target_id]);
end;
$$;

create or replace function public.create_media_category_at_end(p_user_id uuid, p_name text)
returns setof public.media_categories
language plpgsql security definer set search_path = public
as $$
declare next_order bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('media-categories:' || p_user_id::text, 0));
  select coalesce(max(sort_order), 0) + 1000 into next_order
  from public.media_categories where user_id = p_user_id;
  return query insert into public.media_categories(user_id, name, sort_order)
  values (p_user_id, p_name, next_order) returning *;
end;
$$;

create or replace function public.swap_media_category_sort_orders(
  p_user_id uuid, p_source_id uuid, p_target_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
declare source_order bigint; target_order bigint;
begin
  select sort_order into source_order from public.media_categories
  where id = p_source_id and user_id = p_user_id for update;
  select sort_order into target_order from public.media_categories
  where id = p_target_id and user_id = p_user_id for update;
  if source_order is null or target_order is null or p_source_id = p_target_id then
    raise exception using errcode = 'P0002', message = '影视分类不存在';
  end if;
  set constraints media_categories_user_sort_unique deferred;
  update public.media_categories set sort_order = case id
    when p_source_id then target_order when p_target_id then source_order end
  where user_id = p_user_id and id = any(array[p_source_id, p_target_id]);
end;
$$;

create or replace function public.create_media_season_with_episodes(
  p_user_id uuid, p_media_entry_id uuid, p_name text, p_episode_count integer default 0
)
returns setof public.media_seasons
language plpgsql security definer set search_path = public
as $$
declare created_season public.media_seasons; next_order bigint; entry_type text;
begin
  if p_episode_count < 0 or p_episode_count > 500 then
    raise exception using errcode = '22023', message = '集数无效';
  end if;
  select media_type into entry_type from public.media_entries
  where id = p_media_entry_id and user_id = p_user_id for update;
  if entry_type is null then
    raise exception using errcode = 'P0002', message = '影视条目不存在';
  end if;
  if not (entry_type = any(array['电视剧','动漫','动画','动画片','广播剧']::text[])) then
    raise exception using errcode = '22023', message = '该影视分类不支持分季和单集';
  end if;
  select coalesce(max(sort_order), 0) + 1000 into next_order
  from public.media_seasons
  where media_entry_id = p_media_entry_id and user_id = p_user_id;
  insert into public.media_seasons(user_id, media_entry_id, name, sort_order)
  values (p_user_id, p_media_entry_id, btrim(p_name), next_order)
  returning * into created_season;
  if p_episode_count > 0 then
    insert into public.media_episodes(user_id, season_id, episode_number)
    select p_user_id, created_season.id, number
    from generate_series(1, p_episode_count) as number;
  end if;
  return next created_season;
end;
$$;

create or replace function public.add_next_media_episode(p_user_id uuid, p_season_id uuid)
returns setof public.media_episodes
language plpgsql security definer set search_path = public
as $$
declare next_number integer;
begin
  perform id from public.media_seasons
  where id = p_season_id and user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = '季不存在';
  end if;
  select coalesce(max(episode_number), 0) + 1 into next_number
  from public.media_episodes where season_id = p_season_id and user_id = p_user_id;
  return query insert into public.media_episodes(user_id, season_id, episode_number)
  values (p_user_id, p_season_id, next_number) returning *;
end;
$$;

create or replace function public.search_favorite_media_episodes(
  p_user_id uuid, p_media_type text, p_keyword text default ''
)
returns table (
  id uuid, season_id uuid, media_entry_id uuid, media_title text,
  media_type text, platforms text[], season_name text, episode_number integer,
  episode_title text, plot_summary text, updated_at timestamptz
)
language sql security definer set search_path = public
as $$
  select episode.id, season.id, entry.id, entry.title, entry.media_type,
    entry.platforms, season.name, episode.episode_number, episode.title,
    episode.plot_summary, episode.updated_at
  from public.media_episodes as episode
  join public.media_seasons as season
    on season.id = episode.season_id and season.user_id = p_user_id
  join public.media_entries as entry
    on entry.id = season.media_entry_id and entry.user_id = p_user_id
  where episode.user_id = p_user_id and episode.is_favorite
    and entry.media_type = p_media_type
    and (
      coalesce(btrim(p_keyword), '') = ''
      or entry.title ilike '%' || btrim(p_keyword) || '%'
      or season.name ilike '%' || btrim(p_keyword) || '%'
      or episode.title ilike '%' || btrim(p_keyword) || '%'
      or episode.plot_summary ilike '%' || btrim(p_keyword) || '%'
      or exists (
        select 1 from jsonb_array_elements(episode.timeline_notes) as note
        where note ->> 'content' ilike '%' || btrim(p_keyword) || '%'
          or note ->> 'timecode' = btrim(p_keyword)
          or exists (
            select 1 from jsonb_array_elements(
              case when jsonb_typeof(note -> 'dialogues') = 'array'
                then note -> 'dialogues' else '[]'::jsonb end
            ) as dialogue
            where dialogue ->> 'speaker' ilike '%' || btrim(p_keyword) || '%'
              or dialogue ->> 'content' ilike '%' || btrim(p_keyword) || '%'
          )
      )
      or episode.episode_number::text = btrim(p_keyword)
    )
  order by episode.updated_at desc, entry.title, season.sort_order, episode.episode_number;
$$;

create or replace function public.swap_activity_item_sort_orders(
  p_user_id uuid, p_source_id uuid, p_target_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
declare source_order bigint; target_order bigint; source_type text; target_type text;
begin
  select sort_order, activity_type into source_order, source_type
  from public.activity_items where id = p_source_id and user_id = p_user_id for update;
  select sort_order, activity_type into target_order, target_type
  from public.activity_items where id = p_target_id and user_id = p_user_id for update;
  if source_order is null or target_order is null or p_source_id = p_target_id then
    raise exception using errcode = 'P0002', message = '活动项目不存在';
  end if;
  if source_type <> target_type then
    raise exception using errcode = '22023', message = '只能交换同一分类下的活动';
  end if;
  update public.activity_items set sort_order = case id
    when p_source_id then target_order when p_target_id then source_order end
  where user_id = p_user_id and id = any(array[p_source_id, p_target_id]);
end;
$$;

create or replace function public.swap_luggage_group_sort_orders(
  p_user_id uuid, p_source_id uuid, p_target_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
declare source_scene uuid; target_scene uuid; source_order bigint; target_order bigint;
begin
  select scene_id, sort_order into source_scene, source_order from public.luggage_groups
  where id = p_source_id and user_id = p_user_id for update;
  select scene_id, sort_order into target_scene, target_order from public.luggage_groups
  where id = p_target_id and user_id = p_user_id for update;
  if source_scene is null or target_scene is null then
    raise exception using errcode = 'P0002', message = '行李层级不存在';
  end if;
  if source_scene <> target_scene then
    raise exception using errcode = '23514', message = '只能调整同一场景内的层级顺序';
  end if;
  update public.luggage_groups set sort_order = case id
    when p_source_id then target_order when p_target_id then source_order end
  where user_id = p_user_id and id = any(array[p_source_id, p_target_id]);
end;
$$;

create or replace function public.move_luggage_group(
  p_user_id uuid, p_source_id uuid, p_target_id uuid, p_insert_after boolean
)
returns void language plpgsql security definer set search_path = public
as $$
declare scene_id_value uuid; target_scene_id uuid; ids uuid[]; target_position integer;
begin
  select scene_id into scene_id_value from public.luggage_groups
  where id = p_source_id and user_id = p_user_id;
  select scene_id into target_scene_id from public.luggage_groups
  where id = p_target_id and user_id = p_user_id;
  if scene_id_value is null or target_scene_id is null then
    raise exception using errcode = 'P0002', message = '行李层级不存在';
  end if;
  if scene_id_value <> target_scene_id then
    raise exception using errcode = '23514', message = '只能在同一场景内移动层级';
  end if;
  if p_source_id = p_target_id then return; end if;
  select array_agg(id order by sort_order, id) into ids from public.luggage_groups
  where user_id = p_user_id and scene_id = scene_id_value and id <> p_source_id;
  select position into target_position
  from unnest(ids) with ordinality as ordered(id, position) where id = p_target_id;
  if p_insert_after then target_position := target_position + 1; end if;
  ids := coalesce(ids[1:target_position - 1], array[]::uuid[])
    || array[p_source_id]
    || coalesce(ids[target_position:array_length(ids, 1)], array[]::uuid[]);
  update public.luggage_groups as item set sort_order = ordered.position * 1000
  from unnest(ids) with ordinality as ordered(id, position)
  where item.id = ordered.id and item.user_id = p_user_id;
end;
$$;

create or replace function public.move_luggage_item(
  p_user_id uuid,
  p_source_id uuid,
  p_target_group_id uuid,
  p_target_item_id uuid,
  p_insert_after boolean
)
returns void language plpgsql security definer set search_path = public
as $$
declare source_group uuid; source_scene uuid; target_scene uuid; ids uuid[]; insert_at integer;
begin
  select item.group_id, parent.scene_id into source_group, source_scene
  from public.luggage_items as item join public.luggage_groups as parent on parent.id = item.group_id
  where item.id = p_source_id and item.user_id = p_user_id;
  select scene_id into target_scene from public.luggage_groups
  where id = p_target_group_id and user_id = p_user_id;
  if source_group is null or target_scene is null then
    raise exception using errcode = 'P0002', message = '行李物品或目标层级不存在';
  end if;
  if source_scene <> target_scene then
    raise exception using errcode = '23514', message = '物品只能在同一场景内移动';
  end if;
  if p_target_item_id = p_source_id and source_group = p_target_group_id then return; end if;
  select array_agg(id order by sort_order, id) into ids from public.luggage_items
  where user_id = p_user_id and group_id = p_target_group_id and id <> p_source_id;
  if p_target_item_id is null then
    insert_at := coalesce(array_length(ids, 1), 0) + 1;
  else
    select position into insert_at
    from unnest(ids) with ordinality as ordered(id, position)
    where id = p_target_item_id;
    if insert_at is null then
      raise exception using errcode = '23514', message = '目标物品不在目标层级中';
    end if;
    if p_insert_after then insert_at := insert_at + 1; end if;
  end if;
  ids := coalesce(ids[1:insert_at - 1], array[]::uuid[])
    || array[p_source_id]
    || coalesce(ids[insert_at:array_length(ids, 1)], array[]::uuid[]);
  update public.luggage_items as item
  set group_id = p_target_group_id, sort_order = ordered.position * 1000
  from unnest(ids) with ordinality as ordered(id, position)
  where item.id = ordered.id and item.user_id = p_user_id;
  if source_group <> p_target_group_id then
    with remaining as (
      select id, row_number() over(order by sort_order, id) as position
      from public.luggage_items where user_id = p_user_id and group_id = source_group
    )
    update public.luggage_items as item set sort_order = remaining.position * 1000
    from remaining where item.id = remaining.id and item.user_id = p_user_id;
  end if;
end;
$$;

create or replace function public.create_dining_scene_at_end(p_user_id uuid, p_name text)
returns setof public.dining_scenes
language plpgsql security definer set search_path = public
as $$
declare next_order bigint;
begin
  select coalesce(max(sort_order), 0) + 1000 into next_order
  from public.dining_scenes where user_id = p_user_id;
  return query insert into public.dining_scenes(user_id, name, sort_order)
  values (p_user_id, p_name, next_order) returning *;
end;
$$;

create or replace function public.swap_dining_scene_sort_orders(
  p_user_id uuid, p_source_id uuid, p_target_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
declare source_order bigint; target_order bigint;
begin
  select sort_order into source_order from public.dining_scenes
  where id = p_source_id and user_id = p_user_id for update;
  select sort_order into target_order from public.dining_scenes
  where id = p_target_id and user_id = p_user_id for update;
  if source_order is null or target_order is null or p_source_id = p_target_id then
    raise exception using errcode = 'P0002', message = '用餐场景不存在';
  end if;
  set constraints dining_scenes_user_sort_unique deferred;
  update public.dining_scenes set sort_order = case id
    when p_source_id then target_order when p_target_id then source_order end
  where user_id = p_user_id and id = any(array[p_source_id, p_target_id]);
end;
$$;

revoke all on function public.ensure_user_defaults(uuid) from public, anon, authenticated;
revoke all on function public.create_dish_at_end(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.reorder_dishes(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.swap_dish_sort_orders(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_media_entry_at_end(uuid, text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.move_media_entry_to_type_at_end(uuid, uuid, text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.reorder_media_entries(uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function public.swap_media_entry_sort_orders(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_media_category_at_end(uuid, text) from public, anon, authenticated;
revoke all on function public.swap_media_category_sort_orders(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_media_season_with_episodes(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.add_next_media_episode(uuid, uuid) from public, anon, authenticated;
revoke all on function public.search_favorite_media_episodes(uuid, text, text) from public, anon, authenticated;
revoke all on function public.swap_activity_item_sort_orders(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.swap_luggage_group_sort_orders(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.move_luggage_group(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.move_luggage_item(uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_dining_scene_at_end(uuid, text) from public, anon, authenticated;
revoke all on function public.swap_dining_scene_sort_orders(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.ensure_user_defaults(uuid) to service_role;
grant execute on function public.create_dish_at_end(uuid, uuid, text, uuid, text, text) to service_role;
grant execute on function public.reorder_dishes(uuid, uuid[]) to service_role;
grant execute on function public.swap_dish_sort_orders(uuid, uuid, uuid) to service_role;
grant execute on function public.create_media_entry_at_end(uuid, text, text, text, text[]) to service_role;
grant execute on function public.move_media_entry_to_type_at_end(uuid, uuid, text, text, text, text[]) to service_role;
grant execute on function public.reorder_media_entries(uuid, text, uuid[]) to service_role;
grant execute on function public.swap_media_entry_sort_orders(uuid, uuid, uuid) to service_role;
grant execute on function public.create_media_category_at_end(uuid, text) to service_role;
grant execute on function public.swap_media_category_sort_orders(uuid, uuid, uuid) to service_role;
grant execute on function public.create_media_season_with_episodes(uuid, uuid, text, integer) to service_role;
grant execute on function public.add_next_media_episode(uuid, uuid) to service_role;
grant execute on function public.search_favorite_media_episodes(uuid, text, text) to service_role;
grant execute on function public.swap_activity_item_sort_orders(uuid, uuid, uuid) to service_role;
grant execute on function public.swap_luggage_group_sort_orders(uuid, uuid, uuid) to service_role;
grant execute on function public.move_luggage_group(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.move_luggage_item(uuid, uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.create_dining_scene_at_end(uuid, text) to service_role;
grant execute on function public.swap_dining_scene_sort_orders(uuid, uuid, uuid) to service_role;

-- Prevent accidental future use of legacy RPCs that do not require ownership.
revoke all on function public.create_dish_at_end(uuid, text, uuid, text, text) from service_role;
revoke all on function public.reorder_dishes(uuid[]) from service_role;
revoke all on function public.swap_dish_sort_orders(uuid, uuid) from service_role;
revoke all on function public.create_media_entry_at_end(text, text, text, text[]) from service_role;
revoke all on function public.move_media_entry_to_type_at_end(uuid, text, text, text, text[]) from service_role;
revoke all on function public.reorder_media_entries(text, uuid[]) from service_role;
revoke all on function public.swap_media_entry_sort_orders(uuid, uuid) from service_role;
revoke all on function public.create_media_category_at_end(text) from service_role;
revoke all on function public.swap_media_category_sort_orders(uuid, uuid) from service_role;
revoke all on function public.create_media_season_with_episodes(uuid, text, integer) from service_role;
revoke all on function public.add_next_media_episode(uuid) from service_role;
revoke all on function public.search_favorite_media_episodes(text, text) from service_role;
revoke all on function public.swap_activity_item_sort_orders(uuid, uuid) from service_role;
revoke all on function public.swap_luggage_group_sort_orders(uuid, uuid) from service_role;
revoke all on function public.move_luggage_group(uuid, uuid, boolean) from service_role;
revoke all on function public.move_luggage_item(uuid, uuid, uuid) from service_role;
revoke all on function public.move_luggage_item(uuid, uuid, uuid, boolean) from service_role;
revoke all on function public.create_dining_scene_at_end(text) from service_role;
revoke all on function public.swap_dining_scene_sort_orders(uuid, uuid) from service_role;
