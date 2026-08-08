alter table public.media_entries
add column if not exists personal_rating smallint;

-- Historical “worth revisiting” marks represent a strong positive preference.
-- Unmarked rows stay unrated because an absent mark is not a negative score.
update public.media_entries
set personal_rating = 4
where is_revisitable is true
  and personal_rating is null;

alter table public.media_entries
drop constraint if exists media_entries_personal_rating_valid;

alter table public.media_entries
add constraint media_entries_personal_rating_valid check (
  personal_rating is null or personal_rating between 1 and 5
);

-- Keep older clients that still write the binary revisit flag compatible with
-- the rating model, while making 4–5 stars visible to those clients as a mark.
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
      new.personal_rating := 4;
    end if;
  elsif new.personal_rating is distinct from old.personal_rating then
    new.is_revisitable := new.personal_rating is not null and new.personal_rating >= 4;
  elsif new.is_revisitable is distinct from old.is_revisitable then
    new.personal_rating := case when new.is_revisitable then 4 else null end;
  end if;
  return new;
end;
$$;

drop trigger if exists media_entries_sync_personal_rating on public.media_entries;
create trigger media_entries_sync_personal_rating
before insert or update of personal_rating, is_revisitable
on public.media_entries
for each row execute function public.sync_media_personal_rating();

create index if not exists media_entries_user_rating_updated_idx
on public.media_entries (
  user_id,
  personal_rating desc nulls last,
  updated_at desc
);
