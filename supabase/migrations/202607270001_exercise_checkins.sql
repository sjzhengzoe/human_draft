create table if not exists public.exercise_profiles (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  daily_minutes integer not null default 30 check (daily_minutes between 1 and 300),
  monthly_rest_days integer not null default 4 check (monthly_rest_days between 0 and 28),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercise_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  month_start date not null,
  claim_date date,
  claim_end_date date not null,
  claimed_at timestamptz,
  base_task_minutes integer not null default 0 check (base_task_minutes >= 0),
  extra_task_minutes integer not null default 0 check (extra_task_minutes >= 0),
  completed_minutes integer not null default 0 check (completed_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_months_user_month_unique unique (user_id, month_start),
  constraint exercise_months_completed_not_over_total
    check (completed_minutes <= base_task_minutes + extra_task_minutes)
);

create table if not exists public.exercise_daily_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  exercise_month_id uuid not null references public.exercise_months(id) on delete cascade,
  completion_date date not null,
  minutes integer not null check (minutes > 0),
  created_at timestamptz not null default now(),
  constraint exercise_daily_user_date_unique unique (user_id, completion_date)
);

create index if not exists exercise_months_user_month_idx
  on public.exercise_months(user_id, month_start);
create index if not exists exercise_daily_user_date_idx
  on public.exercise_daily_completions(user_id, completion_date);

drop trigger if exists exercise_profiles_set_updated_at on public.exercise_profiles;
create trigger exercise_profiles_set_updated_at
  before update on public.exercise_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists exercise_months_set_updated_at on public.exercise_months;
create trigger exercise_months_set_updated_at
  before update on public.exercise_months
  for each row execute function public.set_updated_at();

create or replace function public.save_exercise_profile(
  p_user_id uuid,
  p_daily_minutes integer,
  p_monthly_rest_days integer
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.exercise_profiles (user_id, daily_minutes, monthly_rest_days)
  values (p_user_id, p_daily_minutes, p_monthly_rest_days)
  on conflict (user_id) do update set
    daily_minutes = excluded.daily_minutes,
    monthly_rest_days = excluded.monthly_rest_days;
end;
$$;

create or replace function public.claim_exercise_month(
  p_user_id uuid,
  p_month_start date,
  p_claim_date date,
  p_claim_end_date date,
  p_base_task_minutes integer
) returns void
language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_months:' || p_user_id::text || ':' || p_month_start::text, 0)
  );

  insert into public.exercise_months (
    user_id,
    month_start,
    claim_date,
    claim_end_date,
    claimed_at,
    base_task_minutes
  ) values (
    p_user_id,
    p_month_start,
    p_claim_date,
    p_claim_end_date,
    now(),
    p_base_task_minutes
  )
  on conflict (user_id, month_start) do update set
    claim_date = excluded.claim_date,
    claim_end_date = excluded.claim_end_date,
    claimed_at = excluded.claimed_at,
    base_task_minutes = excluded.base_task_minutes
  where public.exercise_months.claimed_at is null;

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception using errcode = 'P0001', message = '本月任务已经领取';
  end if;
end;
$$;

create or replace function public.add_exercise_task(
  p_user_id uuid,
  p_month_start date,
  p_claim_end_date date,
  p_minutes integer
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_months:' || p_user_id::text || ':' || p_month_start::text, 0)
  );

  insert into public.exercise_months (
    user_id,
    month_start,
    claim_end_date,
    extra_task_minutes
  ) values (
    p_user_id,
    p_month_start,
    p_claim_end_date,
    p_minutes
  )
  on conflict (user_id, month_start) do update set
    extra_task_minutes = public.exercise_months.extra_task_minutes + excluded.extra_task_minutes;
end;
$$;

create or replace function public.complete_exercise_daily(
  p_user_id uuid,
  p_month_start date,
  p_completion_date date,
  p_minutes integer
) returns void
language plpgsql security definer set search_path = public as $$
declare target public.exercise_months%rowtype;
declare actual_minutes integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_months:' || p_user_id::text || ':' || p_month_start::text, 0)
  );

  select * into target
  from public.exercise_months
  where user_id = p_user_id and month_start = p_month_start
  for update;

  if target.id is null or target.completed_minutes >= target.base_task_minutes + target.extra_task_minutes then
    raise exception using errcode = 'P0002', message = '当前没有待完成任务';
  end if;

  actual_minutes := least(
    p_minutes,
    target.base_task_minutes + target.extra_task_minutes - target.completed_minutes
  );

  insert into public.exercise_daily_completions (
    user_id,
    exercise_month_id,
    completion_date,
    minutes
  ) values (
    p_user_id,
    target.id,
    p_completion_date,
    actual_minutes
  );

  update public.exercise_months
  set completed_minutes = completed_minutes + actual_minutes
  where id = target.id;
end;
$$;

create or replace function public.complete_exercise_extra(
  p_user_id uuid,
  p_month_start date,
  p_minutes integer
) returns void
language plpgsql security definer set search_path = public as $$
declare target public.exercise_months%rowtype;
declare remaining integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_months:' || p_user_id::text || ':' || p_month_start::text, 0)
  );

  select * into target
  from public.exercise_months
  where user_id = p_user_id and month_start = p_month_start
  for update;

  if target.id is null then
    raise exception using errcode = 'P0002', message = '当前没有待完成任务';
  end if;

  remaining := target.base_task_minutes + target.extra_task_minutes - target.completed_minutes;
  if remaining <= 0 then
    raise exception using errcode = 'P0002', message = '当前没有待完成任务';
  end if;
  if p_minutes > remaining then
    raise exception using errcode = '22023', message = '完成分钟数超过待完成任务';
  end if;

  update public.exercise_months
  set completed_minutes = completed_minutes + p_minutes
  where id = target.id;
end;
$$;

alter table public.exercise_profiles enable row level security;
alter table public.exercise_months enable row level security;
alter table public.exercise_daily_completions enable row level security;

revoke all on public.exercise_profiles from anon, authenticated;
revoke all on public.exercise_months from anon, authenticated;
revoke all on public.exercise_daily_completions from anon, authenticated;
grant select, insert, update, delete on public.exercise_profiles to service_role;
grant select, insert, update, delete on public.exercise_months to service_role;
grant select, insert, update, delete on public.exercise_daily_completions to service_role;

revoke all on function public.save_exercise_profile(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.claim_exercise_month(uuid, date, date, date, integer) from public, anon, authenticated;
revoke all on function public.add_exercise_task(uuid, date, date, integer) from public, anon, authenticated;
revoke all on function public.complete_exercise_daily(uuid, date, date, integer) from public, anon, authenticated;
revoke all on function public.complete_exercise_extra(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.save_exercise_profile(uuid, integer, integer) to service_role;
grant execute on function public.claim_exercise_month(uuid, date, date, date, integer) to service_role;
grant execute on function public.add_exercise_task(uuid, date, date, integer) to service_role;
grant execute on function public.complete_exercise_daily(uuid, date, date, integer) to service_role;
grant execute on function public.complete_exercise_extra(uuid, date, integer) to service_role;
