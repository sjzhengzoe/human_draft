alter table public.exercise_months
  add column if not exists base_completed_minutes integer not null default 0,
  add column if not exists extra_completed_minutes integer not null default 0;

with daily_totals as (
  select
    exercise_month_id,
    coalesce(sum(minutes), 0)::integer as daily_minutes
  from public.exercise_daily_completions
  group by exercise_month_id
),
allocations as (
  select
    month.id,
    least(
      month.extra_task_minutes,
      greatest(
        0,
        month.completed_minutes
          - least(month.base_task_minutes, coalesce(daily.daily_minutes, 0))
      )
    ) as extra_completed
  from public.exercise_months month
  left join daily_totals daily on daily.exercise_month_id = month.id
)
update public.exercise_months month
set
  extra_completed_minutes = allocation.extra_completed,
  base_completed_minutes = month.completed_minutes - allocation.extra_completed
from allocations allocation
where month.id = allocation.id;

alter table public.exercise_months
  drop constraint if exists exercise_months_base_completed_valid,
  drop constraint if exists exercise_months_extra_completed_valid,
  drop constraint if exists exercise_months_completed_bucket_sum;

alter table public.exercise_months
  add constraint exercise_months_base_completed_valid
    check (base_completed_minutes between 0 and base_task_minutes),
  add constraint exercise_months_extra_completed_valid
    check (extra_completed_minutes between 0 and extra_task_minutes),
  add constraint exercise_months_completed_bucket_sum
    check (completed_minutes = base_completed_minutes + extra_completed_minutes);

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

  if target.id is null or target.base_completed_minutes >= target.base_task_minutes then
    raise exception using errcode = 'P0002', message = '当前没有待完成的日常任务';
  end if;

  actual_minutes := least(
    p_minutes,
    target.base_task_minutes - target.base_completed_minutes
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
  set
    base_completed_minutes = base_completed_minutes + actual_minutes,
    completed_minutes = completed_minutes + actual_minutes
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
declare total_remaining integer;
declare extra_actual integer;
declare base_actual integer;
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

  total_remaining :=
    target.base_task_minutes + target.extra_task_minutes - target.completed_minutes;
  if total_remaining <= 0 then
    raise exception using errcode = 'P0002', message = '当前没有待完成任务';
  end if;
  if p_minutes > total_remaining then
    raise exception using errcode = '22023', message = '完成分钟数超过待完成任务';
  end if;

  extra_actual := least(
    p_minutes,
    target.extra_task_minutes - target.extra_completed_minutes
  );
  base_actual := p_minutes - extra_actual;

  update public.exercise_months
  set
    base_completed_minutes = base_completed_minutes + base_actual,
    extra_completed_minutes = extra_completed_minutes + extra_actual,
    completed_minutes = completed_minutes + p_minutes
  where id = target.id;
end;
$$;

revoke all on function public.complete_exercise_daily(uuid, date, date, integer)
  from public, anon, authenticated;
revoke all on function public.complete_exercise_extra(uuid, date, integer)
  from public, anon, authenticated;
grant execute on function public.complete_exercise_daily(uuid, date, date, integer)
  to service_role;
grant execute on function public.complete_exercise_extra(uuid, date, integer)
  to service_role;
