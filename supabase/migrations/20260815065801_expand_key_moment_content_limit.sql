begin;

alter table public.key_moments
drop constraint if exists key_moments_content_check;

alter table public.key_moments
add constraint key_moments_content_check
check (char_length(content) <= 2000) not valid;

alter table public.key_moments
validate constraint key_moments_content_check;

commit;
