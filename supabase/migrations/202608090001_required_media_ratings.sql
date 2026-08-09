-- Completed works now require a 1–5 star rating. Preserve every historical
-- score while giving previously unscored completed works the new default.
update public.media_entries
set personal_rating = 3
where watch_status = 'completed'
  and personal_rating is null;

alter table public.media_entries
drop constraint if exists media_entries_personal_rating_valid;

alter table public.media_entries
add constraint media_entries_personal_rating_valid check (
  personal_rating is null or personal_rating between 1 and 5
) not valid;

alter table public.media_entries
validate constraint media_entries_personal_rating_valid;

alter table public.media_entries
drop constraint if exists media_entries_completed_rating_required;

alter table public.media_entries
add constraint media_entries_completed_rating_required check (
  watch_status <> 'completed' or personal_rating is not null
) not valid;

alter table public.media_entries
validate constraint media_entries_completed_rating_required;

-- Keep older clients compatible: completed inserts without the new field get
-- three stars, while the legacy revisit switch still maps to five or three.
create or replace function public.sync_media_personal_rating()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.personal_rating is not null then
      new.is_revisitable := new.personal_rating >= 4;
    elsif new.is_revisitable is true then
      new.personal_rating := 5;
    elsif new.watch_status = 'completed' then
      new.personal_rating := 3;
      new.is_revisitable := false;
    end if;
  elsif new.personal_rating is distinct from old.personal_rating then
    if new.personal_rating is null and new.watch_status = 'completed' then
      new.personal_rating := 3;
    end if;
    new.is_revisitable := new.personal_rating is not null and new.personal_rating >= 4;
  elsif new.is_revisitable is distinct from old.is_revisitable then
    new.personal_rating := case
      when new.is_revisitable then 5
      when new.watch_status = 'completed' then 3
      else null
    end;
  elsif new.watch_status is distinct from old.watch_status
    and new.watch_status = 'completed'
    and new.personal_rating is null then
    new.personal_rating := 3;
    new.is_revisitable := false;
  end if;
  return new;
end;
$$;

drop trigger if exists media_entries_sync_personal_rating on public.media_entries;
create trigger media_entries_sync_personal_rating
before insert or update of personal_rating, is_revisitable, watch_status
on public.media_entries
for each row execute function public.sync_media_personal_rating();
