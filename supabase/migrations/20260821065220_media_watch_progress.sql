set lock_timeout = '5s';

alter table public.media_entries
add column if not exists last_watched_episode_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_episodes_id_uid_unique'
      and conrelid = 'public.media_episodes'::regclass
  ) then
    alter table public.media_episodes
    add constraint media_episodes_id_uid_unique unique (id, uid);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_entries_last_watched_episode_user_fkey'
      and conrelid = 'public.media_entries'::regclass
  ) then
    alter table public.media_entries
    add constraint media_entries_last_watched_episode_user_fkey
    foreign key (last_watched_episode_id, uid)
    references public.media_episodes(id, uid)
    on delete set null (last_watched_episode_id);
  end if;
end;
$$;

create index if not exists media_entries_last_watched_episode_idx
on public.media_entries(last_watched_episode_id, uid)
where last_watched_episode_id is not null;

create or replace function public.set_media_watch_progress(
  p_uid text,
  p_media_entry_id uuid,
  p_episode_id uuid
)
returns setof public.media_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_watch_status text;
begin
  select entry.watch_status into current_watch_status
  from public.media_entries as entry
  where entry.id = p_media_entry_id
    and entry.uid = p_uid
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = '影视条目不存在';
  end if;
  if current_watch_status <> 'in_progress' then
    raise exception using
      errcode = '22023',
      message = '只有正在看的作品可以更新观看进度';
  end if;

  perform episode.id
  from public.media_episodes as episode
  join public.media_seasons as season
    on season.id = episode.season_id
    and season.uid = episode.uid
  where episode.id = p_episode_id
    and episode.uid = p_uid
    and season.media_entry_id = p_media_entry_id;
  if not found then
    raise exception using
      errcode = '22023',
      message = '所选单集不属于当前影视作品';
  end if;

  return query
  update public.media_entries as entry
  set last_watched_episode_id = p_episode_id
  where entry.id = p_media_entry_id
    and entry.uid = p_uid
  returning entry.*;
end;
$$;

revoke all on function public.set_media_watch_progress(text, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.set_media_watch_progress(text, uuid, uuid)
to service_role;
