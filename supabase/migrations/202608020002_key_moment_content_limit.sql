alter table public.key_moments
drop constraint if exists key_moments_content_check;

alter table public.key_moments
add constraint key_moments_content_check
check (char_length(content) <= 50) not valid;
