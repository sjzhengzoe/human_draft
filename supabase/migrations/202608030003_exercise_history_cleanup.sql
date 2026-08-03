-- Preserve legacy activity before removing the superseded monthly-task model.
-- The guards also make this migration safe after a manually applied cleanup.
do $cleanup$
begin
  if to_regclass('public.exercise_daily_completions') is not null then
    insert into public.exercise_completion_events (
      user_id,
      completion_date,
      minutes,
      created_at
    )
    select
      legacy.user_id,
      legacy.completion_date,
      legacy.minutes,
      legacy.created_at
    from public.exercise_daily_completions legacy
    where not exists (
      select 1
      from public.exercise_completion_events current
      where current.user_id = legacy.user_id
        and current.completion_date = legacy.completion_date
    );
  end if;

  if to_regclass('public.exercise_rest_day_events') is not null then
    insert into public.exercise_daily_rest_days (
      user_id,
      rest_date,
      created_at
    )
    select
      legacy.user_id,
      legacy.rest_date,
      legacy.created_at
    from public.exercise_rest_day_events legacy
    on conflict (user_id, rest_date) do nothing;
  end if;
end;
$cleanup$;

-- Make historical activity visible in the current calendar. The profile's
-- configured daily target is the best available target for legacy dates.
with activity_dates as (
  select user_id, min(activity_date) as first_activity_date
  from (
    select user_id, completion_date as activity_date
    from public.exercise_completion_events
    union all
    select user_id, rest_date as activity_date
    from public.exercise_daily_rest_days
  ) activity
  group by user_id
),
first_goals as (
  select user_id, min(effective_date) as first_goal_date
  from public.exercise_daily_goal_changes
  group by user_id
)
insert into public.exercise_daily_goal_changes (
  user_id,
  effective_date,
  daily_minutes
)
select
  activity.user_id,
  activity.first_activity_date,
  profile.daily_minutes
from activity_dates activity
join public.exercise_profiles profile on profile.user_id = activity.user_id
left join first_goals goal on goal.user_id = activity.user_id
where goal.first_goal_date is null
   or activity.first_activity_date < goal.first_goal_date
on conflict (user_id, effective_date) do nothing;

-- Keep reset aligned with the current four-table exercise model before the
-- legacy tables are dropped, so it no longer retains dependencies on them.
create or replace function public.reset_exercise_daily_state(
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_daily_state:' || p_user_id::text, 0)
  );

  delete from public.exercise_daily_rest_days where user_id = p_user_id;
  delete from public.exercise_completion_events where user_id = p_user_id;
end;
$$;

revoke all on function public.reset_exercise_daily_state(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_exercise_daily_state(uuid)
  to service_role;

drop function if exists public.save_exercise_profile(uuid, integer, integer);
drop function if exists public.claim_exercise_month(uuid, date, date, date, integer);
drop function if exists public.claim_exercise_month(uuid, date, date, date, integer, integer);
drop function if exists public.add_exercise_task(uuid, date, date, integer);
drop function if exists public.complete_exercise_daily(uuid, date, date, integer);
drop function if exists public.complete_exercise_extra(uuid, date, integer);
drop function if exists public.complete_exercise_tasks(uuid, date, integer);
drop function if exists public.consume_exercise_rest_day(uuid, date, date);
drop function if exists public.reset_exercise_state(uuid);
drop function if exists public.add_exercise_daily_extra_task(uuid, date, integer);
drop function if exists public.allocate_exercise_minutes(uuid, date, integer);

drop table if exists public.exercise_daily_extra_tasks;
drop table if exists public.exercise_rest_day_events;
drop table if exists public.exercise_daily_completions;
drop table if exists public.exercise_months;

alter table public.exercise_profiles
  drop column if exists credit_minutes;
