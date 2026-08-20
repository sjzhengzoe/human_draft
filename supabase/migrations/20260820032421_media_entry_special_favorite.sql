alter table public.media_entries
  add column if not exists is_special_favorite boolean not null default false;

drop function if exists public.create_media_entry_at_end(
  text, text, text, text, text[], smallint
);

drop function if exists public.move_media_entry_to_type_at_end(
  text, uuid, text, text, text, text[]
);

create function public.create_media_entry_at_end(
  p_uid text,
  p_title text,
  p_media_type text,
  p_watch_status text,
  p_platforms text[],
  p_personal_rating smallint default null,
  p_is_special_favorite boolean default false
)
returns setof public.media_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  next_order bigint;
  resolved_personal_rating smallint;
begin
  if not exists (
    select 1
    from public.media_categories
    where uid = p_uid and name = p_media_type
  ) then
    raise exception using errcode = 'P0002', message = '影视分类不存在';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media:' || p_uid, 0));

  select coalesce(max(sort_order), 0) + 1000
  into next_order
  from public.media_entries
  where uid = p_uid and media_type = p_media_type;

  resolved_personal_rating := case
    when p_watch_status = 'completed' then coalesce(p_personal_rating, 3)
    else p_personal_rating
  end;

  return query
  insert into public.media_entries (
    uid,
    title,
    media_type,
    watch_status,
    platforms,
    personal_rating,
    is_special_favorite,
    sort_order
  ) values (
    p_uid,
    p_title,
    p_media_type,
    p_watch_status,
    p_platforms,
    resolved_personal_rating,
    coalesce(p_is_special_favorite, false),
    next_order
  )
  returning *;
end;
$$;

create function public.move_media_entry_to_type_at_end(
  p_uid text,
  p_entry_id uuid,
  p_title text,
  p_media_type text,
  p_watch_status text,
  p_platforms text[],
  p_is_special_favorite boolean default null
)
returns setof public.media_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  current_type text;
  next_order bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('media:' || p_uid, 0));

  select media_type
  into current_type
  from public.media_entries
  where id = p_entry_id and uid = p_uid
  for update;

  if current_type is null then
    raise exception using errcode = 'P0002', message = '影视条目不存在';
  end if;

  if not exists (
    select 1
    from public.media_categories
    where uid = p_uid and name = p_media_type
  ) then
    raise exception using errcode = 'P0002', message = '影视分类不存在';
  end if;

  if current_type = p_media_type then
    return query
    update public.media_entries as entry
    set title = coalesce(p_title, entry.title),
        watch_status = coalesce(p_watch_status, entry.watch_status),
        platforms = coalesce(p_platforms, entry.platforms),
        is_special_favorite = coalesce(
          p_is_special_favorite,
          entry.is_special_favorite
        )
    where entry.id = p_entry_id and entry.uid = p_uid
    returning entry.*;
    return;
  end if;

  select coalesce(max(sort_order), 0) + 1000
  into next_order
  from public.media_entries
  where uid = p_uid and media_type = p_media_type;

  return query
  update public.media_entries as entry
  set title = coalesce(p_title, entry.title),
      media_type = p_media_type,
      watch_status = coalesce(p_watch_status, entry.watch_status),
      platforms = coalesce(p_platforms, entry.platforms),
      is_special_favorite = coalesce(
        p_is_special_favorite,
        entry.is_special_favorite
      ),
      sort_order = next_order
  where entry.id = p_entry_id and entry.uid = p_uid
  returning entry.*;
end;
$$;

revoke all on function public.create_media_entry_at_end(
  text, text, text, text, text[], smallint, boolean
) from public, anon, authenticated;

revoke all on function public.move_media_entry_to_type_at_end(
  text, uuid, text, text, text, text[], boolean
) from public, anon, authenticated;

grant execute on function public.create_media_entry_at_end(
  text, text, text, text, text[], smallint, boolean
) to service_role;

grant execute on function public.move_media_entry_to_type_at_end(
  text, uuid, text, text, text, text[], boolean
) to service_role;
