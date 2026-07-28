import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  calculateCatState,
  calculateExerciseRollup,
  calculateMonthlyClaim,
  calculatePendingBreakdown,
  getExerciseDashboard,
} from "./lib/exercise.mjs";

const USER_ID = "10000000-0000-4000-8000-000000000002";
const JULY_FIRST_CHINA = new Date("2026-06-30T16:00:00.000Z");
const JULY_TWENTY_SEVENTH_CHINA = new Date("2026-07-26T16:00:00.000Z");

test("monthly claim prorates configured rest days over the remaining month", () => {
  const claim = calculateMonthlyClaim({
    dailyMinutes: 30,
    monthlyRestDays: 4,
    now: JULY_TWENTY_SEVENTH_CHINA,
  });

  assert.equal(claim.today, "2026-07-27");
  assert.equal(claim.remainingDays, 5);
  assert.equal(claim.proratedRestDays, 1);
  assert.equal(claim.plannedExerciseDays, 4);
  assert.equal(claim.taskMinutes, 120);
});

test("claiming alone leaves the shared bowl empty, while completed minutes feed both pets", () => {
  const baseMonth = {
    base_task_minutes: 810,
    extra_task_minutes: 0,
    completed_minutes: 0,
    claim_date: "2026-07-01",
    claim_end_date: "2026-07-31",
  };

  const beforeExercise = calculateCatState({
    month: baseMonth,
    dailyMinutes: 30,
    today: "2026-07-01",
  });
  assert.equal(beforeExercise.foodRatio, 0);
  assert.equal(beforeExercise.bowlLevel, "empty");
  assert.equal(beforeExercise.emotion, "pitiful");

  const afterDaily = calculateCatState({
    month: { ...baseMonth, completed_minutes: 30 },
    dailyMinutes: 30,
    today: "2026-07-01",
  });
  assert.equal(afterDaily.bowlLevel, "full");
  assert.equal(afterDaily.emotion, "happy");

  const withUnfinishedExtra = calculateCatState({
    month: { ...baseMonth, extra_task_minutes: 60, completed_minutes: 30 },
    dailyMinutes: 30,
    today: "2026-07-01",
  });
  assert.equal(withUnfinishedExtra.emotion, "unhappy");

  const withFinishedExtra = calculateCatState({
    month: { ...baseMonth, extra_task_minutes: 60, completed_minutes: 90 },
    dailyMinutes: 30,
    today: "2026-07-01",
  });
  assert.equal(withFinishedExtra.bowlLevel, "full");
  assert.equal(withFinishedExtra.emotion, "happy");
});

test("completed and prepaid future minutes keep both pets happy", () => {
  const state = calculateCatState({
    month: {
      base_task_minutes: 810,
      extra_task_minutes: 0,
      completed_minutes: 120,
      claim_date: "2026-07-01",
      claim_end_date: "2026-07-31",
    },
    dailyMinutes: 30,
    today: "2026-07-03",
  });

  assert.equal(state.paceGapMinutes, 0);
  assert.equal(state.bowlLevel, "full");
  assert.equal(state.emotion, "happy");
});

test("unfinished daily and extra minutes accumulate in today's pending display", () => {
  const pending = calculatePendingBreakdown({
    baseTaskMinutes: 100,
    extraTaskMinutes: 400,
    baseCompletedMinutes: 20,
    extraCompletedMinutes: 100,
    futureBaseMinutes: 60,
  });

  assert.deepEqual(pending, {
    pendingMinutes: 20,
    extraPendingMinutes: 300,
  });
});

test("rolling credit makes the total balance negative and offsets daily work before extras", () => {
  const rollup = calculateExerciseRollup({
    months: [{
      month_start: "2026-07-01",
      claim_date: "2026-07-01",
      claim_end_date: "2026-07-31",
      base_task_minutes: 100,
      extra_task_minutes: 20,
      base_completed_minutes: 100,
      extra_completed_minutes: 20,
      completed_minutes: 120,
    }],
    creditMinutes: 30,
    today: "2026-07-31",
  });

  assert.equal(rollup.remainingMinutes, -30);
  assert.equal(rollup.pendingMinutes, 0);
  assert.equal(rollup.extraPendingMinutes, 0);
  assert.equal(rollup.bowlLevel, "full");

  const prioritized = calculatePendingBreakdown({
    baseTaskMinutes: 100,
    extraTaskMinutes: 400,
    baseCompletedMinutes: 20,
    extraCompletedMinutes: 100,
    futureBaseMinutes: 0,
    creditMinutes: 100,
  });
  assert.deepEqual(prioritized, {
    pendingMinutes: 0,
    extraPendingMinutes: 280,
  });
});

test("dashboard reads every exercise table with the authenticated user scope", async () => {
  const scopedTables = [];
  const tables = {
    exercise_profiles: [{ user_id: USER_ID, daily_minutes: 30, monthly_rest_days: 4 }],
    exercise_months: [],
    exercise_daily_completions: [],
  };
  const supabase = {
    from(table) {
      const filters = [];
      const query = {
        select() {
          return query;
        },
        eq(field, value) {
          filters.push([field, value]);
          return query;
        },
        async maybeSingle() {
          scopedTables.push({ table, filters });
          const matching = (tables[table] || []).find((row) =>
            filters.every(([field, value]) => row[field] === value)
          );
          return { data: matching || null, error: null };
        },
        async order() {
          scopedTables.push({ table, filters });
          const matching = (tables[table] || []).filter((row) =>
            filters.every(([field, value]) => row[field] === value)
          );
          return { data: matching, error: null };
        },
      };
      return query;
    },
  };

  await getExerciseDashboard(supabase, USER_ID, JULY_FIRST_CHINA);

  assert.equal(scopedTables.length, 2);
  for (const entry of scopedTables) {
    assert.ok(
      entry.filters.some(([field, value]) => field === "user_id" && value === USER_ID),
      `${entry.table} must be filtered by the authenticated user`,
    );
  }
});

test("rolling-credit migration records completions and carries surplus forward", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202607270003_exercise_rolling_credit.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /credit_minutes integer not null default 0/i);
  assert.match(migration, /create table if not exists public\.exercise_completion_events/i);
  assert.match(migration, /create or replace function public\.complete_exercise_tasks/i);
  assert.match(migration, /available_minutes := public\.allocate_exercise_minutes/i);
  assert.match(migration, /set credit_minutes = available_minutes/i);
  assert.match(migration, /order by month_start, created_at[\s\S]*?for update/i);
});

test("exercise migration enforces per-user rows and service-role-only mutations", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202607270001_exercise_checkins.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /exercise_profiles[\s\S]*?user_id uuid primary key/i);
  assert.match(migration, /unique \(user_id, month_start\)/i);
  assert.match(migration, /unique \(user_id, completion_date\)/i);
  assert.match(migration, /revoke all on public\.exercise_months from anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.complete_exercise_daily[\s\S]*?service_role/i);
});

test("completion bucket migration preserves totals and separates daily from extra work", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202607270002_exercise_completion_buckets.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /base_completed_minutes integer not null default 0/i);
  assert.match(migration, /extra_completed_minutes integer not null default 0/i);
  assert.match(
    migration,
    /completed_minutes = base_completed_minutes \+ extra_completed_minutes/i,
  );
  assert.match(
    migration,
    /base_completed_minutes = base_completed_minutes \+ actual_minutes/i,
  );
  assert.match(
    migration,
    /extra_completed_minutes = extra_completed_minutes \+ extra_actual/i,
  );
});

test("exercise reset migration clears only the user's state and preserves settings", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202607280001_exercise_reset.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /create or replace function public\.reset_exercise_state/i);
  assert.match(migration, /delete from public\.exercise_completion_events[\s\S]*?where user_id = p_user_id/i);
  assert.match(migration, /delete from public\.exercise_daily_completions[\s\S]*?where user_id = p_user_id/i);
  assert.match(migration, /delete from public\.exercise_months[\s\S]*?where user_id = p_user_id/i);
  assert.match(migration, /update public\.exercise_profiles[\s\S]*?set credit_minutes = 0[\s\S]*?where user_id = p_user_id/i);
  assert.doesNotMatch(migration, /delete from public\.exercise_profiles/i);
  assert.match(migration, /grant execute on function public\.reset_exercise_state\(uuid\)[\s\S]*?to service_role/i);
});
