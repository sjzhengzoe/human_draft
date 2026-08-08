alter table public.media_entries
add column if not exists completed_personal_rating smallint
generated always as (
  case when watch_status = 'completed' then personal_rating else null end
) stored;

create index if not exists media_entries_user_completed_rating_updated_idx
on public.media_entries (
  user_id,
  completed_personal_rating desc nulls last,
  updated_at desc
);
