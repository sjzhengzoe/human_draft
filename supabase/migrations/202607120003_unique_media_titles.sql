create unique index if not exists media_entries_type_title_unique
on public.media_entries (media_type, lower(btrim(title)));
