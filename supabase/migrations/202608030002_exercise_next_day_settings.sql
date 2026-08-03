create table if not exists public.exercise_daily_goal_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  effective_date date not null,
  daily_minutes integer not null check (daily_minutes between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_daily_goal_changes_user_date_unique unique (user_id, effective_date)
);

create index if not exists exercise_daily_goal_changes_user_date_idx
  on public.exercise_daily_goal_changes(user_id, effective_date);

drop trigger if exists exercise_daily_goal_changes_set_updated_at
  on public.exercise_daily_goal_changes;
create trigger exercise_daily_goal_changes_set_updated_at
  before update on public.exercise_daily_goal_changes
  for each row execute function public.set_updated_at();

alter table public.exercise_daily_goal_changes enable row level security;
revoke all on public.exercise_daily_goal_changes from anon, authenticated;
grant select, insert, update, delete on public.exercise_daily_goal_changes to service_role;

insert into public.exercise_daily_goal_changes (user_id, effective_date, daily_minutes)
select
  user_id,
  (timezone('Asia/Shanghai', now()))::date,
  daily_minutes
from public.exercise_profiles
on conflict (user_id, effective_date) do nothing;

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
  used_rest_days integer;
begin
  if p_daily_minutes is null or p_daily_minutes < 1 or p_daily_minutes > 300 then
    raise exception using errcode = '22023', message = '每日运动分钟数必须在 1 到 300 之间';
  end if;
  if p_monthly_rest_days is null or p_monthly_rest_days < 0 or p_monthly_rest_days > 28 then
    raise exception using errcode = '22023', message = '每月休息天数必须在 0 到 28 之间';
  end if;
  if p_effective_date is null or p_effective_date <= p_current_date then
    raise exception using errcode = '22023', message = '每日运动目标必须从次日开始生效';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_profile_settings:' || p_user_id::text, 0)
  );

  select daily_minutes into current_daily_minutes
  from public.exercise_daily_goal_changes
  where user_id = p_user_id and effective_date <= p_current_date
  order by effective_date desc
  limit 1;

  if current_daily_minutes is null then
    select daily_minutes into current_daily_minutes
    from public.exercise_profiles
    where user_id = p_user_id;
  end if;
  current_daily_minutes := coalesce(current_daily_minutes, 30);

  select count(*)::integer into used_rest_days
  from public.exercise_daily_rest_days
  where user_id = p_user_id
    and rest_date >= date_trunc('month', p_current_date)::date
    and rest_date < (date_trunc('month', p_current_date) + interval '1 month')::date;

  if p_monthly_rest_days < used_rest_days then
    raise exception using errcode = 'P0005', message = '每月休息天数不能少于本月已使用天数';
  end if;

  insert into public.exercise_daily_goal_changes (user_id, effective_date, daily_minutes)
  values (p_user_id, p_current_date, current_daily_minutes)
  on conflict (user_id, effective_date) do nothing;

  insert into public.exercise_daily_goal_changes (user_id, effective_date, daily_minutes)
  values (p_user_id, p_effective_date, p_daily_minutes)
  on conflict (user_id, effective_date) do update set
    daily_minutes = excluded.daily_minutes;

  insert into public.exercise_profiles (user_id, daily_minutes, monthly_rest_days)
  values (p_user_id, p_daily_minutes, p_monthly_rest_days)
  on conflict (user_id) do update set
    daily_minutes = excluded.daily_minutes,
    monthly_rest_days = excluded.monthly_rest_days;
end;
$$;

revoke all on function public.save_exercise_profile_for_next_day(
  uuid, integer, integer, date, date
) from public, anon, authenticated;
grant execute on function public.save_exercise_profile_for_next_day(
  uuid, integer, integer, date, date
) to service_role;
