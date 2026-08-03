create table if not exists public.exercise_daily_extra_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  task_date date not null,
  minutes integer not null check (minutes > 0),
  created_at timestamptz not null default now()
);

create index if not exists exercise_daily_extra_tasks_user_date_idx
  on public.exercise_daily_extra_tasks(user_id, task_date, created_at);

create table if not exists public.exercise_daily_rest_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  rest_date date not null,
  created_at timestamptz not null default now(),
  constraint exercise_daily_rest_days_user_date_unique unique (user_id, rest_date)
);

create index if not exists exercise_daily_rest_days_user_date_idx
  on public.exercise_daily_rest_days(user_id, rest_date);

alter table public.exercise_daily_extra_tasks enable row level security;
alter table public.exercise_daily_rest_days enable row level security;

revoke all on public.exercise_daily_extra_tasks from anon, authenticated;
revoke all on public.exercise_daily_rest_days from anon, authenticated;
grant select, insert, update, delete on public.exercise_daily_extra_tasks to service_role;
grant select, insert, update, delete on public.exercise_daily_rest_days to service_role;

create or replace function public.add_exercise_daily_extra_task(
  p_user_id uuid,
  p_task_date date,
  p_minutes integer
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_minutes is null or p_minutes <= 0 then
    raise exception using errcode = '22023', message = '加餐任务分钟数必须大于 0';
  end if;

  insert into public.exercise_daily_extra_tasks (user_id, task_date, minutes)
  values (p_user_id, p_task_date, p_minutes);
end;
$$;

create or replace function public.record_exercise_daily_completion(
  p_user_id uuid,
  p_completion_date date,
  p_minutes integer
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_minutes is null or p_minutes <= 0 then
    raise exception using errcode = '22023', message = '完成分钟数必须大于 0';
  end if;

  insert into public.exercise_completion_events (user_id, completion_date, minutes)
  values (p_user_id, p_completion_date, p_minutes);
end;
$$;

create or replace function public.use_exercise_daily_rest_day(
  p_user_id uuid,
  p_rest_date date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  configured_rest_days integer;
  used_rest_days integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_daily_rest_days:' || p_user_id::text, 0)
  );

  if exists (
    select 1
    from public.exercise_daily_rest_days
    where user_id = p_user_id and rest_date = p_rest_date
  ) then
    raise exception using errcode = 'P0003', message = '今天已经使用过休息日';
  end if;

  select coalesce(monthly_rest_days, 4) into configured_rest_days
  from public.exercise_profiles
  where user_id = p_user_id;
  configured_rest_days := coalesce(configured_rest_days, 4);

  select count(*)::integer into used_rest_days
  from public.exercise_daily_rest_days
  where user_id = p_user_id
    and rest_date >= date_trunc('month', p_rest_date)::date
    and rest_date < (date_trunc('month', p_rest_date) + interval '1 month')::date;

  if used_rest_days >= configured_rest_days then
    raise exception using errcode = 'P0004', message = '本月休息日已经用完';
  end if;

  insert into public.exercise_daily_rest_days (user_id, rest_date)
  values (p_user_id, p_rest_date);
end;
$$;

create or replace function public.reset_exercise_daily_state(
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_daily_state:' || p_user_id::text, 0)
  );

  delete from public.exercise_daily_extra_tasks where user_id = p_user_id;
  delete from public.exercise_daily_rest_days where user_id = p_user_id;
  delete from public.exercise_rest_day_events where user_id = p_user_id;
  delete from public.exercise_completion_events where user_id = p_user_id;
  delete from public.exercise_daily_completions where user_id = p_user_id;
  delete from public.exercise_months where user_id = p_user_id;

  update public.exercise_profiles
  set credit_minutes = 0
  where user_id = p_user_id;
end;
$$;

revoke all on function public.add_exercise_daily_extra_task(uuid, date, integer)
  from public, anon, authenticated;
revoke all on function public.record_exercise_daily_completion(uuid, date, integer)
  from public, anon, authenticated;
revoke all on function public.use_exercise_daily_rest_day(uuid, date)
  from public, anon, authenticated;
revoke all on function public.reset_exercise_daily_state(uuid)
  from public, anon, authenticated;

grant execute on function public.add_exercise_daily_extra_task(uuid, date, integer)
  to service_role;
grant execute on function public.record_exercise_daily_completion(uuid, date, integer)
  to service_role;
grant execute on function public.use_exercise_daily_rest_day(uuid, date)
  to service_role;
grant execute on function public.reset_exercise_daily_state(uuid)
  to service_role;
