-- Rating triggers were removed with the obsolete is_revisitable column. Keep
-- the required rating in the canonical create RPC so the row is valid at the
-- moment it is inserted instead of relying on a follow-up update.

drop function if exists public.create_media_entry_at_end(
  text, text, text, text, text[]
);

create or replace function public.create_media_entry_at_end(
  p_uid text,
  p_title text,
  p_media_type text,
  p_watch_status text,
  p_platforms text[],
  p_personal_rating smallint default null
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
    select 1 from public.media_categories
    where uid = p_uid and name = p_media_type
  ) then
    raise exception using errcode = 'P0002', message = '影视分类不存在';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media:' || p_uid, 0));

  select coalesce(max(sort_order), 0) + 1000 into next_order
  from public.media_entries
  where uid = p_uid and media_type = p_media_type;

  resolved_personal_rating := case
    when p_watch_status = 'completed' then coalesce(p_personal_rating, 3)
    else p_personal_rating
  end;

  return query insert into public.media_entries (
    uid,
    title,
    media_type,
    watch_status,
    platforms,
    personal_rating,
    sort_order
  ) values (
    p_uid,
    p_title,
    p_media_type,
    p_watch_status,
    p_platforms,
    resolved_personal_rating,
    next_order
  ) returning *;
end;
$$;

revoke all on function public.create_media_entry_at_end(
  text, text, text, text, text[], smallint
) from public, anon, authenticated;

grant execute on function public.create_media_entry_at_end(
  text, text, text, text, text[], smallint
) to service_role;
