begin;

drop index if exists public.key_moments_user_occurred_idx;

create index key_moments_uid_timeline_idx
  on public.key_moments(uid, occurred_at desc, created_at desc, id desc);

commit;
