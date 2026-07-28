create or replace function public.reset_exercise_state(
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('public.exercise_ledger:' || p_user_id::text, 0)
  );

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

revoke all on function public.reset_exercise_state(uuid)
  from public, anon, authenticated;

grant execute on function public.reset_exercise_state(uuid)
  to service_role;
