alter table public.exercise_months
  add column if not exists rest_days_total integer not null default 0,
  add column if not exists rest_days_used integer not null default 0;

alter table public.exercise_months
  drop constraint if exists exercise_months_rest_days_total_valid,
  drop constraint if exists exercise_months_rest_days_used_valid;

alter table public.exercise_months
  add constraint exercise_months_rest_days_total_valid
    check (rest_days_total between 0 and 28),
  add constraint exercise_months_rest_days_used_valid
    check (rest_days_used between 0 and rest_days_total);

create table if not exists public.exercise_rest_day_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  exercise_month_id uuid not null references public.exercise_months(id) on delete cascade,
  rest_date date not null,
  minutes integer not null check (minutes > 0),
  created_at timestamptz not null default now(),
  constraint exercise_rest_day_user_date_unique unique (user_id, rest_date)
);

create index if not exists exercise_rest_day_events_user_date_idx
  on public.exercise_rest_day_events(user_id, rest_date);

alter table public.exercise_rest_day_events enable row level security;
revoke all on public.exercise_rest_day_events from anon, authenticated;
grant select, insert, update, delete on public.exercise_rest_day_events to service_role;

-- Bring an already-claimed current month onto the new model without changing history.
update public.exercise_months month
set
  base_task_minutes = greatest(
    month.base_task_minutes,
    (month.claim_end_date - month.claim_date + 1) * profile.daily_minutes
  ),
  rest_days_total = case
    when profile.monthly_rest_days = 0 then 0
    else least(
      month.claim_end_date - month.claim_date + 1,
      greatest(
        1,
        round(
          profile.monthly_rest_days::numeric
          * (month.claim_end_date - month.claim_date + 1)::numeric
          / greatest(1, month.claim_end_date - month.month_start + 1)
        )::integer
      )
    )
  end
from public.exercise_profiles profile
where month.user_id = profile.user_id
  and month.claimed_at is not null
  and month.claim_date is not null
  and month.month_start = date_trunc(
    'month',
    now() at time zone 'Asia/Shanghai'
  )::date;

create or replace function public.claim_exercise_month(
  p_user_id uuid,
  p_month_start date,
  p_claim_date date,
  p_claim_end_date date,
  p_base_task_minutes integer,
  p_rest_days_total integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  affected integer;
  available_minutes integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_ledger:' || p_user_id::text, 0)
  );

  insert into public.exercise_profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.exercise_months (
    user_id,
    month_start,
    claim_date,
    claim_end_date,
    claimed_at,
    base_task_minutes,
    rest_days_total,
    rest_days_used
  ) values (
    p_user_id,
    p_month_start,
    p_claim_date,
    p_claim_end_date,
    now(),
    p_base_task_minutes,
    p_rest_days_total,
    0
  )
  on conflict (user_id, month_start) do update set
    claim_date = excluded.claim_date,
    claim_end_date = excluded.claim_end_date,
    claimed_at = excluded.claimed_at,
    base_task_minutes = excluded.base_task_minutes,
    rest_days_total = excluded.rest_days_total,
    rest_days_used = 0
  where public.exercise_months.claimed_at is null;

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception using errcode = 'P0001', message = '本月任务已经领取';
  end if;

  select credit_minutes into available_minutes
  from public.exercise_profiles
  where user_id = p_user_id
  for update;

  update public.exercise_profiles set credit_minutes = 0 where user_id = p_user_id;
  available_minutes := public.allocate_exercise_minutes(
    p_user_id,
    p_claim_date,
    available_minutes
  );
  update public.exercise_profiles
  set credit_minutes = available_minutes
  where user_id = p_user_id;
end;
$$;

create or replace function public.consume_exercise_rest_day(
  p_user_id uuid,
  p_month_start date,
  p_rest_date date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target public.exercise_months%rowtype;
  rest_minutes integer;
  available_minutes integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_ledger:' || p_user_id::text, 0)
  );

  select * into target
  from public.exercise_months
  where user_id = p_user_id
    and month_start = p_month_start
  for update;

  if target.id is null or target.claimed_at is null then
    raise exception using errcode = 'P0002', message = '请先领取本月任务';
  end if;
  if exists (
    select 1
    from public.exercise_rest_day_events
    where user_id = p_user_id and rest_date = p_rest_date
  ) then
    raise exception using errcode = 'P0003', message = '今天已经使用过休息日';
  end if;
  if target.rest_days_used >= target.rest_days_total then
    raise exception using errcode = 'P0004', message = '本月休息日已经用完';
  end if;

  rest_minutes := greatest(
    1,
    target.base_task_minutes
      / greatest(1, target.claim_end_date - target.claim_date + 1)
  );

  update public.exercise_months
  set rest_days_used = rest_days_used + 1
  where id = target.id;

  insert into public.exercise_rest_day_events (
    user_id,
    exercise_month_id,
    rest_date,
    minutes
  ) values (
    p_user_id,
    target.id,
    p_rest_date,
    rest_minutes
  );

  select credit_minutes + rest_minutes into available_minutes
  from public.exercise_profiles
  where user_id = p_user_id;

  update public.exercise_profiles
  set credit_minutes = 0
  where user_id = p_user_id;

  available_minutes := public.allocate_exercise_minutes(
    p_user_id,
    p_rest_date,
    available_minutes
  );

  update public.exercise_profiles
  set credit_minutes = available_minutes
  where user_id = p_user_id;
end;
$$;

create or replace function public.reset_exercise_state(
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_ledger:' || p_user_id::text, 0)
  );

  delete from public.exercise_rest_day_events
  where user_id = p_user_id;

  delete from public.exercise_completion_events
  where user_id = p_user_id;

  delete from public.exercise_daily_completions
  where user_id = p_user_id;

  delete from public.exercise_months
  where user_id = p_user_id;

  update public.exercise_profiles
  set credit_minutes = 0
  where user_id = p_user_id;
end;
$$;

revoke all on function public.claim_exercise_month(
  uuid, date, date, date, integer, integer
) from public, anon, authenticated;
revoke all on function public.consume_exercise_rest_day(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.reset_exercise_state(uuid)
  from public, anon, authenticated;

grant execute on function public.claim_exercise_month(
  uuid, date, date, date, integer, integer
) to service_role;
grant execute on function public.consume_exercise_rest_day(uuid, date, date)
  to service_role;
grant execute on function public.reset_exercise_state(uuid)
  to service_role;
