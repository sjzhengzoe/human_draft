set lock_timeout = '5s';

create index if not exists media_entries_user_updated_id_idx
  on public.media_entries (uid, updated_at desc, id desc);

create index if not exists media_entries_user_status_updated_id_idx
  on public.media_entries (uid, watch_status, updated_at desc, id desc);

create index if not exists media_entries_user_type_updated_id_idx
  on public.media_entries (uid, media_type, updated_at desc, id desc);

create index if not exists media_entries_user_favorite_updated_id_idx
  on public.media_entries (uid, updated_at desc, id desc)
  where is_special_favorite = true;

drop index if exists public.media_entries_user_status_idx;
