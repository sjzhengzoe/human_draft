-- Every business image record now uses its bounded original for both list and detail views.
-- Keep the nullable legacy columns for rollback compatibility, but stop referencing derivatives.

update public.dishes
set thumbnail_path = null
where thumbnail_path is not null;

update public.menu_places
set thumbnail_path = null
where thumbnail_path is not null;

update public.activity_items
set thumbnail_path = null
where thumbnail_path is not null;

update public.wardrobe_items
set thumbnail_path = null
where thumbnail_path is not null;

update public.key_moments
set thumbnail_path = null
where thumbnail_path is not null;
