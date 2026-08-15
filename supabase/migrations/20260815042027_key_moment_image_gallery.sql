begin;

alter table public.key_moments
add column if not exists image_paths text[] not null default '{}'::text[];

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'key_moments'
      and column_name = 'image_path'
  ) then
    execute $migration$
      update public.key_moments
      set image_paths = array[image_path]
      where image_path is not null
        and cardinality(image_paths) = 0
    $migration$;
  end if;
end
$$;

alter table public.key_moments
drop constraint if exists key_moments_has_content;

alter table public.key_moments
drop constraint if exists key_moments_image_paths_count;

alter table public.key_moments
add constraint key_moments_image_paths_count
check (
  cardinality(image_paths) between 0 and 9
  and array_position(image_paths, null) is null
  and array_position(image_paths, '') is null
);

alter table public.key_moments
add constraint key_moments_has_content
check (
  char_length(btrim(content)) > 0
  or cardinality(image_paths) > 0
);

alter table public.key_moments
drop column if exists image_path;

commit;
