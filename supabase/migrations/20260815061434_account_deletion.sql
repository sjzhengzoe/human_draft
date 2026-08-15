-- Service-only queue for completing private COS cleanup after the user's
-- database account and business records have been removed atomically.
create table if not exists public.account_deletion_jobs (
  id uuid primary key,
  uid text not null,
  object_keys text[] not null default '{}',
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_deletion_jobs_uid_check
    check (uid ~ '^(10000|20000|[1-9][0-9]{9})$'),
  constraint account_deletion_jobs_status_check
    check (status in ('pending', 'retrying')),
  constraint account_deletion_jobs_attempt_count_check
    check (attempt_count >= 0),
  constraint account_deletion_jobs_last_error_length_check
    check (last_error_code is null or char_length(last_error_code) <= 80)
);

create unique index if not exists account_deletion_jobs_uid_idx
  on public.account_deletion_jobs (uid);
create index if not exists account_deletion_jobs_updated_idx
  on public.account_deletion_jobs (updated_at, id);

alter table public.account_deletion_jobs enable row level security;
revoke all on table public.account_deletion_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.account_deletion_jobs to service_role;

create or replace function public.delete_app_account(
  p_uid text,
  p_job_id uuid,
  p_object_keys text[] default '{}'
)
returns table (
  deleted boolean,
  cleanup_pending boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_uid text;
  normalized_keys text[] := coalesce(p_object_keys, '{}');
begin
  if p_uid is null or p_uid !~ '^(10000|20000|[1-9][0-9]{9})$' then
    raise exception 'invalid account uid' using errcode = '22023';
  end if;
  if p_job_id is null then
    raise exception 'missing deletion job id' using errcode = '22023';
  end if;
  if cardinality(normalized_keys) > 20000 then
    raise exception 'too many account objects' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(normalized_keys) as object_key
    where object_key is null
      or char_length(object_key) < 1
      or char_length(object_key) > 1024
  ) then
    raise exception 'invalid account object key' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_uid, 0));

  insert into public.account_deletion_jobs (
    id,
    uid,
    object_keys,
    status,
    attempt_count,
    created_at,
    updated_at
  ) values (
    p_job_id,
    p_uid,
    normalized_keys,
    'pending',
    0,
    now(),
    now()
  );

  -- Product events are removed instead of merely anonymized because account
  -- deletion is a user-rights action. Operational and control audits retain
  -- their non-content diagnostics but their uid references are set to null by
  -- their existing foreign keys.
  delete from public.product_events where uid = p_uid;

  delete from public.app_users
  where uid = p_uid
  returning uid into deleted_uid;

  if deleted_uid is null then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  return query
  select true, cardinality(normalized_keys) > 0;
end;
$$;

revoke all on function public.delete_app_account(text, uuid, text[])
  from public, anon, authenticated;
grant execute on function public.delete_app_account(text, uuid, text[])
  to service_role;
