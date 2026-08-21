create or replace function public.save_media_season_drafts(
  p_uid text,
  p_media_entry_id uuid,
  p_seasons jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  season_item jsonb;
  episode_item jsonb;
  draft_season_id uuid;
  draft_episode_id uuid;
  saved_season_id uuid;
  season_ids uuid[] := array[]::uuid[];
  episode_ids uuid[];
  season_names text[] := array[]::text[];
  season_name text;
  draft_episode_title text;
  draft_plot_summary text;
  season_position integer := 0;
  episode_position integer;
begin
  if jsonb_typeof(p_seasons) <> 'array' then
    raise exception using errcode = '22023', message = '分季草稿格式无效';
  end if;
  if jsonb_array_length(p_seasons) > 50 then
    raise exception using errcode = '22023', message = '每部作品最多 50 季';
  end if;

  perform id from public.media_entries
  where id = p_media_entry_id and uid = p_uid
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = '影视条目不存在';
  end if;

  for season_item in select value from jsonb_array_elements(p_seasons)
  loop
    if jsonb_typeof(season_item) <> 'object' then
      raise exception using errcode = '22023', message = '分季草稿格式无效';
    end if;
    season_name := btrim(coalesce(season_item->>'name', ''));
    if season_name = '' or char_length(season_name) > 80 then
      raise exception using errcode = '22023', message = '季名称需为 1 到 80 个字符';
    end if;
    if lower(season_name) = any(season_names) then
      raise exception using errcode = '23505', message = '存在重复的季名称';
    end if;
    season_names := array_append(season_names, lower(season_name));
    if jsonb_typeof(coalesce(season_item->'episodes', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(season_item->'episodes', '[]'::jsonb)) > 500 then
      raise exception using errcode = '22023', message = '每季集数需为 0 到 500';
    end if;

    if nullif(season_item->>'id', '') is not null then
      begin
        draft_season_id := (season_item->>'id')::uuid;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = '季编号无效';
      end;
      if draft_season_id = any(season_ids) then
        raise exception using errcode = '22023', message = '分季草稿包含重复季';
      end if;
      perform id from public.media_seasons
      where id = draft_season_id and media_entry_id = p_media_entry_id and uid = p_uid;
      if not found then
        raise exception using errcode = 'P0002', message = '季不存在';
      end if;
      season_ids := array_append(season_ids, draft_season_id);
    else
      draft_season_id := null;
    end if;

    episode_ids := array[]::uuid[];
    for episode_item in
      select value from jsonb_array_elements(coalesce(season_item->'episodes', '[]'::jsonb))
    loop
      draft_episode_title := btrim(coalesce(episode_item->>'title', ''));
      if char_length(draft_episode_title) > 120 then
        raise exception using errcode = '22023', message = '单集名称不能超过 120 个字';
      end if;
      draft_plot_summary := btrim(coalesce(episode_item->>'plot_summary', ''));
      if char_length(draft_plot_summary) > 24 then
        raise exception using errcode = '22023', message = '剧情详情不能超过 24 个字';
      end if;
      if nullif(episode_item->>'id', '') is not null then
        begin
          draft_episode_id := (episode_item->>'id')::uuid;
        exception when invalid_text_representation then
          raise exception using errcode = '22023', message = '单集编号无效';
        end;
        if draft_episode_id = any(episode_ids) then
          raise exception using errcode = '22023', message = '分季草稿包含重复单集';
        end if;
        perform id from public.media_episodes
        where id = draft_episode_id and season_id = draft_season_id and uid = p_uid;
        if not found then
          raise exception using errcode = 'P0002', message = '单集不存在';
        end if;
        episode_ids := array_append(episode_ids, draft_episode_id);
      end if;
    end loop;
  end loop;

  delete from public.media_seasons
  where media_entry_id = p_media_entry_id
    and uid = p_uid
    and not (id = any(season_ids));

  update public.media_seasons
  set name = id::text
  where media_entry_id = p_media_entry_id and uid = p_uid;

  season_position := 0;
  for season_item in select value from jsonb_array_elements(p_seasons)
  loop
    season_position := season_position + 1;
    season_name := btrim(season_item->>'name');
    if nullif(season_item->>'id', '') is null then
      insert into public.media_seasons(uid, media_entry_id, name, sort_order)
      values (p_uid, p_media_entry_id, season_name, season_position * 1000)
      returning id into saved_season_id;
    else
      saved_season_id := (season_item->>'id')::uuid;
      update public.media_seasons
      set name = season_name, sort_order = season_position * 1000
      where id = saved_season_id and uid = p_uid;
    end if;

    episode_ids := array[]::uuid[];
    for episode_item in
      select value from jsonb_array_elements(coalesce(season_item->'episodes', '[]'::jsonb))
    loop
      if nullif(episode_item->>'id', '') is not null then
        episode_ids := array_append(episode_ids, (episode_item->>'id')::uuid);
      end if;
    end loop;
    delete from public.media_episodes
    where season_id = saved_season_id
      and uid = p_uid
      and not (id = any(episode_ids));

    update public.media_episodes
    set episode_number = episode_number + 1000000
    where season_id = saved_season_id and uid = p_uid;

    episode_position := 0;
    for episode_item in
      select value from jsonb_array_elements(coalesce(season_item->'episodes', '[]'::jsonb))
    loop
      episode_position := episode_position + 1;
      draft_episode_title := btrim(coalesce(episode_item->>'title', ''));
      draft_plot_summary := btrim(coalesce(episode_item->>'plot_summary', ''));
      if nullif(episode_item->>'id', '') is null then
        insert into public.media_episodes(
          uid, season_id, episode_number, title, plot_summary, is_favorite
        ) values (
          p_uid,
          saved_season_id,
          episode_position,
          draft_episode_title,
          draft_plot_summary,
          coalesce((episode_item->>'is_favorite')::boolean, false)
        );
      else
        update public.media_episodes
        set episode_number = episode_position,
            title = draft_episode_title,
            plot_summary = draft_plot_summary,
            is_favorite = coalesce((episode_item->>'is_favorite')::boolean, false)
        where id = (episode_item->>'id')::uuid
          and season_id = saved_season_id
          and uid = p_uid;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.save_media_season_drafts(text, uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.save_media_season_drafts(text, uuid, jsonb)
to service_role;
