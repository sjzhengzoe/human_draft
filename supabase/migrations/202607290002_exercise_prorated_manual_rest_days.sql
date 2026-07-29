-- Correct current-month quotas created before manual rest days were prorated.
update public.exercise_months month
set rest_days_total = greatest(
  month.rest_days_used,
  case
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
)
from public.exercise_profiles profile
where month.user_id = profile.user_id
  and month.claimed_at is not null
  and month.claim_date is not null
  and month.month_start = date_trunc(
    'month',
    now() at time zone 'Asia/Shanghai'
  )::date;
