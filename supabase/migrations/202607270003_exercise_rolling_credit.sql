alter table public.exercise_profiles
  add column if not exists credit_minutes integer not null default 0
  check (credit_minutes >= 0);

create table if not exists public.exercise_completion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  completion_date date not null,
  minutes integer not null check (minutes > 0),
  created_at timestamptz not null default now()
);

create index if not exists exercise_completion_events_user_date_idx
  on public.exercise_completion_events(user_id, completion_date, created_at);

alter table public.exercise_completion_events enable row level security;
revoke all on public.exercise_completion_events from anon, authenticated;
grant select, insert, update, delete on public.exercise_completion_events to service_role;

create or replace function public.allocate_exercise_minutes(
  p_user_id uuid,
  p_as_of_date date,
  p_available_minutes integer
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  target public.exercise_months%rowtype;
  available_minutes integer := greatest(0, p_available_minutes);
  due_base_minutes integer;
  actual_minutes integer;
begin
  for target in
    select *
    from public.exercise_months
    where user_id = p_user_id
    order by month_start, created_at
    for update
  loop
    exit when available_minutes = 0;

    due_base_minutes := case
      when target.base_task_minutes = 0 or target.claim_date is null then 0
      when p_as_of_date < target.claim_date then 0
      when p_as_of_date >= target.claim_end_date then target.base_task_minutes
      else greatest(
        0,
        target.base_task_minutes - round(
          target.base_task_minutes::numeric
          * greatest(0, target.claim_end_date - p_as_of_date)::numeric
          / greatest(1, target.claim_end_date - target.claim_date + 1)
        )::integer
      )
    end;

    actual_minutes := least(
      available_minutes,
      greatest(0, due_base_minutes - target.base_completed_minutes)
    );
    if actual_minutes > 0 then
      update public.exercise_months
      set
        base_completed_minutes = base_completed_minutes + actual_minutes,
        completed_minutes = completed_minutes + actual_minutes
      where id = target.id;
      available_minutes := available_minutes - actual_minutes;
    end if;
  end loop;

  for target in
    select *
    from public.exercise_months
    where user_id = p_user_id
      and extra_completed_minutes < extra_task_minutes
    order by month_start, created_at
    for update
  loop
    exit when available_minutes = 0;
    actual_minutes := least(
      available_minutes,
      target.extra_task_minutes - target.extra_completed_minutes
    );
    update public.exercise_months
    set
      extra_completed_minutes = extra_completed_minutes + actual_minutes,
      completed_minutes = completed_minutes + actual_minutes
    where id = target.id;
    available_minutes := available_minutes - actual_minutes;
  end loop;

  return available_minutes;
end;
$$;

create or replace function public.complete_exercise_tasks(
  p_user_id uuid,
  p_completion_date date,
  p_minutes integer
) returns void
language plpgsql security definer set search_path = public as $$
declare available_minutes integer;
begin
  if p_minutes is null or p_minutes <= 0 then
    raise exception using errcode = '22023', message = '完成分钟数必须大于 0';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_ledger:' || p_user_id::text, 0)
  );

  insert into public.exercise_profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select credit_minutes + p_minutes into available_minutes
  from public.exercise_profiles
  where user_id = p_user_id
  for update;

  update public.exercise_profiles
  set credit_minutes = 0
  where user_id = p_user_id;

  available_minutes := public.allocate_exercise_minutes(
    p_user_id,
    p_completion_date,
    available_minutes
  );

  update public.exercise_profiles
  set credit_minutes = available_minutes
  where user_id = p_user_id;

  insert into public.exercise_completion_events (
    user_id,
    completion_date,
    minutes
  ) values (
    p_user_id,
    p_completion_date,
    p_minutes
  );
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

create or replace function public.add_exercise_task(
  p_user_id uuid,
  p_month_start date,
  p_claim_end_date date,
  p_minutes integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  available_minutes integer;
  as_of_date date := least((now() at time zone 'Asia/Shanghai')::date, p_claim_end_date);
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

  select credit_minutes into available_minutes
  from public.exercise_profiles
  where user_id = p_user_id
  for update;

  update public.exercise_profiles set credit_minutes = 0 where user_id = p_user_id;
  available_minutes := public.allocate_exercise_minutes(
    p_user_id,
    as_of_date,
    available_minutes
  );
  update public.exercise_profiles
  set credit_minutes = available_minutes
  where user_id = p_user_id;
end;
$$;

revoke all on function public.allocate_exercise_minutes(uuid, date, integer)
  from public, anon, authenticated;
revoke all on function public.complete_exercise_tasks(uuid, date, integer)
  from public, anon, authenticated;
revoke all on function public.claim_exercise_month(uuid, date, date, date, integer)
  from public, anon, authenticated;
revoke all on function public.add_exercise_task(uuid, date, date, integer)
  from public, anon, authenticated;

grant execute on function public.complete_exercise_tasks(uuid, date, integer)
  to service_role;
grant execute on function public.claim_exercise_month(uuid, date, date, date, integer)
  to service_role;
grant execute on function public.add_exercise_task(uuid, date, date, integer)
  to service_role;
