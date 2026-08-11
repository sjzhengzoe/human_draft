-- Rest credits are issued every month but never expire. Every grant, use and
-- revocation is recorded so the balance can be rebuilt and audited.
create table if not exists public.exercise_rest_credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  event_type text not null check (event_type in ('monthly_grant', 'use', 'revoke')),
  delta integer not null,
  event_key text not null,
  grant_month date,
  rest_date date,
  created_at timestamptz not null default now(),
  constraint exercise_rest_credit_events_user_key_unique unique (user_id, event_key),
  constraint exercise_rest_credit_events_delta_check check (
    (event_type = 'monthly_grant' and delta between 0 and 28)
    or (event_type = 'use' and delta = -1)
    or (event_type = 'revoke' and delta = 1)
  ),
  constraint exercise_rest_credit_events_grant_month_check check (
    grant_month is null or extract(day from grant_month) = 1
  )
);

create index if not exists exercise_rest_credit_events_user_created_idx
  on public.exercise_rest_credit_events(user_id, created_at);

alter table public.exercise_rest_credit_events enable row level security;
revoke all on public.exercise_rest_credit_events from anon, authenticated;
grant select, insert, update, delete on public.exercise_rest_credit_events to service_role;

create or replace function public.ensure_exercise_rest_credit_grants(
  p_user_id uuid,
  p_through_date date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  tracking_start_date date;
  grant_month_start date;
  grant_month_end date;
  grant_days integer;
begin
  if p_through_date is null then
    raise exception using errcode = '22023', message = '额度发放日期无效';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_rest_credits:' || p_user_id::text, 0)
  );

  select min(effective_date) into tracking_start_date
  from public.exercise_daily_goal_changes
  where user_id = p_user_id;

  if tracking_start_date is null or tracking_start_date > p_through_date then
    return;
  end if;

  grant_month_start := date_trunc('month', tracking_start_date)::date;
  while grant_month_start <= date_trunc('month', p_through_date)::date loop
    grant_month_end := least(
      (grant_month_start + interval '1 month - 1 day')::date,
      p_through_date
    );

    select monthly_rest_days into grant_days
    from public.exercise_daily_goal_changes
    where user_id = p_user_id and effective_date <= grant_month_end
    order by effective_date desc
    limit 1;

    if grant_days is null then
      select monthly_rest_days into grant_days
      from public.exercise_profiles
      where user_id = p_user_id;
    end if;
    grant_days := coalesce(grant_days, 4);

    insert into public.exercise_rest_credit_events (
      user_id, event_type, delta, event_key, grant_month
    ) values (
      p_user_id,
      'monthly_grant',
      grant_days,
      'grant:' || to_char(grant_month_start, 'YYYY-MM'),
      grant_month_start
    ) on conflict (user_id, event_key) do nothing;

    grant_month_start := (grant_month_start + interval '1 month')::date;
  end loop;
end;
$$;

revoke all on function public.ensure_exercise_rest_credit_grants(uuid, date)
  from public, anon, authenticated;
grant execute on function public.ensure_exercise_rest_credit_grants(uuid, date)
  to service_role;

-- Backfill every existing exercise user before debiting their preserved rest
-- records. This is repeat-safe and leaves completion/rest history untouched.
do $backfill$
declare
  exercise_user record;
begin
  for exercise_user in
    select distinct user_id from public.exercise_daily_goal_changes
  loop
    perform public.ensure_exercise_rest_credit_grants(
      exercise_user.user_id,
      (timezone('Asia/Shanghai', now()))::date
    );
  end loop;
end;
$backfill$;

insert into public.exercise_rest_credit_events (
  user_id, event_type, delta, event_key, rest_date, created_at
)
select
  user_id,
  'use',
  -1,
  'use:' || id::text,
  rest_date,
  created_at
from public.exercise_daily_rest_days
on conflict (user_id, event_key) do nothing;

create or replace function public.get_exercise_rest_credit_summary(
  p_user_id uuid,
  p_current_date date
) returns table (balance integer, monthly_grant integer)
language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_exercise_rest_credit_grants(p_user_id, p_current_date);

  return query
  select
    coalesce(sum(event.delta), 0)::integer as balance,
    coalesce(sum(event.delta) filter (
      where event.event_type = 'monthly_grant'
        and event.grant_month = date_trunc('month', p_current_date)::date
    ), 0)::integer as monthly_grant
  from public.exercise_rest_credit_events event
  where event.user_id = p_user_id;
end;
$$;

revoke all on function public.get_exercise_rest_credit_summary(uuid, date)
  from public, anon, authenticated;
grant execute on function public.get_exercise_rest_credit_summary(uuid, date)
  to service_role;

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
  next_grant_month date;
begin
  if p_daily_minutes is null or p_daily_minutes < 1 or p_daily_minutes > 300 then
    raise exception using errcode = '22023', message = '每日运动分钟数必须在 1 到 300 之间';
  end if;
  if p_monthly_rest_days is null or p_monthly_rest_days < 0 or p_monthly_rest_days > 28 then
    raise exception using errcode = '22023', message = '每月发放额度必须在 0 到 28 之间';
  end if;
  if p_effective_date is null or p_effective_date <= p_current_date then
    raise exception using errcode = '22023', message = '运动设置必须从次日开始生效';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_profile_settings:' || p_user_id::text, 0)
  );

  -- Freeze this month's already-issued grant before storing a setting intended
  -- for the next month.
  perform public.ensure_exercise_rest_credit_grants(p_user_id, p_current_date);

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
  next_grant_month := (date_trunc('month', p_current_date) + interval '1 month')::date;

  insert into public.exercise_daily_goal_changes (
    user_id, effective_date, daily_minutes, monthly_rest_days
  ) values (
    p_user_id, p_current_date, current_daily_minutes, current_monthly_rest_days
  ) on conflict (user_id, effective_date) do nothing;

  if p_effective_date < next_grant_month then
    insert into public.exercise_daily_goal_changes (
      user_id, effective_date, daily_minutes, monthly_rest_days
    ) values (
      p_user_id, p_effective_date, p_daily_minutes, current_monthly_rest_days
    ) on conflict (user_id, effective_date) do update set
      daily_minutes = excluded.daily_minutes,
      monthly_rest_days = excluded.monthly_rest_days;
  end if;

  insert into public.exercise_daily_goal_changes (
    user_id, effective_date, daily_minutes, monthly_rest_days
  ) values (
    p_user_id, next_grant_month, p_daily_minutes, p_monthly_rest_days
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
  tracking_start_date date;
  china_today date := (timezone('Asia/Shanghai', now()))::date;
  available_balance integer;
begin
  if p_rest_date is null or p_rest_date > china_today then
    raise exception using errcode = '22023', message = '休息日日期无效';
  end if;

  perform public.ensure_exercise_rest_credit_grants(p_user_id, china_today);

  select min(effective_date) into tracking_start_date
  from public.exercise_daily_goal_changes
  where user_id = p_user_id;

  if tracking_start_date is null or p_rest_date < tracking_start_date then
    raise exception using errcode = 'P0006', message = '该日期尚未开始记录运动';
  end if;

  if exists (
    select 1 from public.exercise_daily_rest_days
    where user_id = p_user_id and rest_date = p_rest_date
  ) then
    raise exception using errcode = 'P0003', message = '该日期已经使用过休息日';
  end if;

  select coalesce(sum(delta), 0)::integer into available_balance
  from public.exercise_rest_credit_events
  where user_id = p_user_id;

  if available_balance <= 0 then
    raise exception using errcode = 'P0004', message = '休息额度不足';
  end if;

  insert into public.exercise_daily_rest_days (user_id, rest_date)
  values (p_user_id, p_rest_date);
end;
$$;

create or replace function public.revoke_exercise_daily_rest_day(
  p_user_id uuid,
  p_rest_date date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  rest_day_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_rest_credits:' || p_user_id::text, 0)
  );

  select id into rest_day_id
  from public.exercise_daily_rest_days
  where user_id = p_user_id and rest_date = p_rest_date
  for update;

  if rest_day_id is null then
    raise exception using errcode = 'P0007', message = '该日期没有可撤回的休息日记录';
  end if;

  delete from public.exercise_daily_rest_days where id = rest_day_id;
end;
$$;

-- Keep the ledger correct even if an older application instance deletes a
-- rest row directly during deployment. Normal use/revoke RPCs rely on the same
-- trigger, so every state change has exactly one matching event.
create or replace function public.sync_exercise_rest_credit_event()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.exercise_rest_credit_events (
      user_id, event_type, delta, event_key, rest_date, created_at
    ) values (
      new.user_id, 'use', -1, 'use:' || new.id::text, new.rest_date, new.created_at
    ) on conflict (user_id, event_key) do nothing;
    return new;
  end if;

  insert into public.exercise_rest_credit_events (
    user_id, event_type, delta, event_key, rest_date
  ) values (
    old.user_id, 'revoke', 1, 'revoke:' || old.id::text, old.rest_date
  ) on conflict (user_id, event_key) do nothing;
  return old;
end;
$$;

drop trigger if exists exercise_daily_rest_days_sync_credit
  on public.exercise_daily_rest_days;
create trigger exercise_daily_rest_days_sync_credit
  after insert or delete on public.exercise_daily_rest_days
  for each row execute function public.sync_exercise_rest_credit_event();

create or replace function public.reset_exercise_daily_state(
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_daily_state:' || p_user_id::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_rest_credits:' || p_user_id::text, 0)
  );

  delete from public.exercise_daily_rest_days where user_id = p_user_id;
  delete from public.exercise_completion_events where user_id = p_user_id;
  delete from public.exercise_rest_credit_events
  where user_id = p_user_id and event_type <> 'monthly_grant';
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

revoke all on function public.revoke_exercise_daily_rest_day(uuid, date)
  from public, anon, authenticated;
grant execute on function public.revoke_exercise_daily_rest_day(uuid, date)
  to service_role;

revoke all on function public.reset_exercise_daily_state(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_exercise_daily_state(uuid)
  to service_role;
