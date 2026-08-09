alter table public.activity_items
add column if not exists introduction text;

update public.activity_items
set introduction = ''
where introduction is null;

alter table public.activity_items
alter column introduction set default '',
alter column introduction set not null;

alter table public.activity_items
drop constraint if exists activity_items_introduction_length;

alter table public.activity_items
add constraint activity_items_introduction_length
check (char_length(introduction) <= 200);

alter table public.activity_items
add column if not exists image_path text,
add column if not exists thumbnail_path text;

alter table public.activity_items
drop constraint if exists activity_items_image_path_length;

alter table public.activity_items
add constraint activity_items_image_path_length
check (image_path is null or char_length(image_path) <= 1000);

alter table public.activity_items
drop constraint if exists activity_items_thumbnail_path_length;

alter table public.activity_items
add constraint activity_items_thumbnail_path_length
check (thumbnail_path is null or char_length(thumbnail_path) <= 1000);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activity-images',
  'activity-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
