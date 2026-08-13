-- User-owned menu, activity, and media images must not remain anonymously readable.
-- The application resolves existing object paths to short-lived signed URLs, so
-- historical objects stay in place and database rows do not need rewriting.

update storage.buckets
set public = false
where id in ('dish-images', 'activity-images', 'media-covers')
  and public is distinct from false;
