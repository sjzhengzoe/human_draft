-- Historical four-star ratings were created from the old binary
-- “worth revisiting” flag. Promote that one-time cohort to five stars while
-- leaving unrated records and future manually selected ratings untouched.
update public.media_entries
set personal_rating = 5
where personal_rating = 4;

-- Older clients may still write is_revisitable instead of personal_rating.
-- Keep them compatible, but map a positive legacy mark to five stars.
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
    end if;
  elsif new.personal_rating is distinct from old.personal_rating then
    new.is_revisitable := new.personal_rating is not null and new.personal_rating >= 4;
  elsif new.is_revisitable is distinct from old.is_revisitable then
    new.personal_rating := case when new.is_revisitable then 5 else null end;
  end if;
  return new;
end;
$$;
