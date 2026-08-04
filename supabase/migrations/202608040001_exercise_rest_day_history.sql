-- Keep the monthly rest-day allowance alongside the dated daily goal so a
-- historical month uses the allowance that belonged to that month.
alter table public.exercise_daily_goal_changes
  add column if not exists monthly_rest_days integer;

-- Older rows did not record this value. The user's current profile setting is
-- the best value available for those dates; no completion or rest-day rows are
-- changed by this backfill.
update public.exercise_daily_goal_changes goal
set monthly_rest_days = coalesce(profile.monthly_rest_days, 4)
from public.exercise_profiles profile
where profile.user_id = goal.user_id
  and goal.monthly_rest_days is null;

update public.exercise_daily_goal_changes
set monthly_rest_days = 4
where monthly_rest_days is null;

alter table public.exercise_daily_goal_changes
  alter column monthly_rest_days set not null;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercise_daily_goal_changes_rest_days_check'
      and conrelid = 'public.exercise_daily_goal_changes'::regclass
  ) then
    alter table public.exercise_daily_goal_changes
      add constraint exercise_daily_goal_changes_rest_days_check
      check (monthly_rest_days between 0 and 28);
  end if;
end;
$constraint$;

create or replace function public.save_exercise_profile_for_next_day(
  p_user_id uuid,
  p_daily_minutes integer,
  p_monthly_rest_days integer,
  p_current_date date,
  p_effective_date date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  current_daily_minutes integer;
  current_monthly_rest_days integer;
  used_rest_days integer;
begin
  if p_daily_minutes is null or p_daily_minutes < 1 or p_daily_minutes > 300 then
    raise exception using errcode = '22023', message = '每日运动分钟数必须在 1 到 300 之间';
  end if;
  if p_monthly_rest_days is null or p_monthly_rest_days < 0 or p_monthly_rest_days > 28 then
    raise exception using errcode = '22023', message = '每月休息天数必须在 0 到 28 之间';
  end if;
  if p_effective_date is null or p_effective_date <= p_current_date then
    raise exception using errcode = '22023', message = '运动设置必须从次日开始生效';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_profile_settings:' || p_user_id::text, 0)
  );

  select daily_minutes, monthly_rest_days
  into current_daily_minutes, current_monthly_rest_days
  from public.exercise_daily_goal_changes
  where user_id = p_user_id and effective_date <= p_current_date
  order by effective_date desc
  limit 1;

  if current_daily_minutes is null then
    select daily_minutes, monthly_rest_days
    into current_daily_minutes, current_monthly_rest_days
    from public.exercise_profiles
    where user_id = p_user_id;
  end if;
  current_daily_minutes := coalesce(current_daily_minutes, 30);
  current_monthly_rest_days := coalesce(current_monthly_rest_days, 4);

  select count(*)::integer into used_rest_days
  from public.exercise_daily_rest_days
  where user_id = p_user_id
    and rest_date >= date_trunc('month', p_current_date)::date
    and rest_date < (date_trunc('month', p_current_date) + interval '1 month')::date;

  if p_monthly_rest_days < used_rest_days then
    raise exception using errcode = 'P0005', message = '每月休息天数不能少于本月已使用天数';
  end if;

  insert into public.exercise_daily_goal_changes (
    user_id, effective_date, daily_minutes, monthly_rest_days
  ) values (
    p_user_id, p_current_date, current_daily_minutes, current_monthly_rest_days
  ) on conflict (user_id, effective_date) do nothing;

  insert into public.exercise_daily_goal_changes (
    user_id, effective_date, daily_minutes, monthly_rest_days
  ) values (
    p_user_id, p_effective_date, p_daily_minutes, p_monthly_rest_days
  ) on conflict (user_id, effective_date) do update set
    daily_minutes = excluded.daily_minutes,
    monthly_rest_days = excluded.monthly_rest_days;

  insert into public.exercise_profiles (user_id, daily_minutes, monthly_rest_days)
  values (p_user_id, p_daily_minutes, p_monthly_rest_days)
  on conflict (user_id) do update set
    daily_minutes = excluded.daily_minutes,
    monthly_rest_days = excluded.monthly_rest_days;
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
  tracking_start_date date;
  china_today date := (timezone('Asia/Shanghai', now()))::date;
  allowance_date date;
begin
  if p_rest_date is null or p_rest_date > china_today then
    raise exception using errcode = '22023', message = '休息日日期无效';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'public.exercise_daily_rest_days:' || p_user_id::text || ':' ||
      date_trunc('month', p_rest_date)::date::text,
      0
    )
  );

  select min(effective_date) into tracking_start_date
  from public.exercise_daily_goal_changes
  where user_id = p_user_id;

  if tracking_start_date is null or p_rest_date < tracking_start_date then
    raise exception using errcode = 'P0006', message = '该日期尚未开始记录运动';
  end if;

  if exists (
    select 1
    from public.exercise_daily_rest_days
    where user_id = p_user_id and rest_date = p_rest_date
  ) then
    raise exception using errcode = 'P0003', message = '该日期已经使用过休息日';
  end if;

  allowance_date := least(
    (date_trunc('month', p_rest_date) + interval '1 month - 1 day')::date,
    china_today
  );

  select monthly_rest_days into configured_rest_days
  from public.exercise_daily_goal_changes
  where user_id = p_user_id and effective_date <= allowance_date
  order by effective_date desc
  limit 1;

  if configured_rest_days is null then
    select monthly_rest_days into configured_rest_days
    from public.exercise_profiles
    where user_id = p_user_id;
  end if;
  configured_rest_days := coalesce(configured_rest_days, 4);

  select count(*)::integer into used_rest_days
  from public.exercise_daily_rest_days
  where user_id = p_user_id
    and rest_date >= date_trunc('month', p_rest_date)::date
    and rest_date < (date_trunc('month', p_rest_date) + interval '1 month')::date;

  if used_rest_days >= configured_rest_days then
    raise exception using errcode = 'P0004', message = '目标月份休息日已经用完';
  end if;

  insert into public.exercise_daily_rest_days (user_id, rest_date)
  values (p_user_id, p_rest_date);
end;
$$;

revoke all on function public.save_exercise_profile_for_next_day(
  uuid, integer, integer, date, date
) from public, anon, authenticated;
grant execute on function public.save_exercise_profile_for_next_day(
  uuid, integer, integer, date, date
) to service_role;

revoke all on function public.use_exercise_daily_rest_day(uuid, date)
  from public, anon, authenticated;
grant execute on function public.use_exercise_daily_rest_day(uuid, date)
  to service_role;
