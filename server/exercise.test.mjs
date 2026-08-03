import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  calculateTodayProgress,
  consumeExerciseRestDay,
  getExerciseDashboard,
} from "./lib/exercise.mjs";

const USER_ID = "10000000-0000-4000-8000-000000000002";
const OTHER_USER_ID = "10000000-0000-4000-8000-000000000003";
const AUGUST_THIRD_CHINA = new Date("2026-08-02T16:00:00.000Z");

function createSupabaseMock(tables) {
  const reads = [];
  const rpcCalls = [];
  return {
    reads,
    rpcCalls,
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      return { error: null };
    },
    from(table) {
      const filters = [];
      const query = {
        select() {
          return query;
        },
        eq(field, value) {
          filters.push(["eq", field, value]);
          return query;
        },
        gte(field, value) {
          filters.push(["gte", field, value]);
          return query;
        },
        lte(field, value) {
          filters.push(["lte", field, value]);
          return query;
        },
        async maybeSingle() {
          reads.push({ table, filters });
          const matching = filterRows(tables[table] || [], filters);
          return { data: matching[0] || null, error: null };
        },
        async order() {
          reads.push({ table, filters });
          return { data: filterRows(tables[table] || [], filters), error: null };
        },
      };
      return query;
    },
  };
}

function filterRows(rows, filters) {
  return rows.filter((row) => filters.every(([operator, field, value]) => {
    if (operator === "eq") return row[field] === value;
    if (operator === "gte") return row[field] >= value;
    if (operator === "lte") return row[field] <= value;
    return true;
  }));
}

test("today starts with an empty bowl even when previous days were completed", () => {
  const progress = calculateTodayProgress({
    dailyMinutes: 20,
    completionMinutes: 0,
  });

  assert.equal(progress.dailyPendingMinutes, 20);
  assert.equal(progress.completedMinutes, 0);
  assert.equal(progress.overachievedMinutes, 0);
  assert.equal(progress.foodRatio, 0);
  assert.equal(progress.bowlLevel, "empty");
});

test("the bowl reflects only today's daily completion ratio", () => {
  const partial = calculateTodayProgress({
    dailyMinutes: 20,
    completionMinutes: 10,
  });
  assert.equal(partial.dailyCompletedMinutes, 10);
  assert.equal(partial.dailyPendingMinutes, 10);
  assert.equal(partial.foodRatio, 0.5);
  assert.equal(partial.bowlLevel, "normal");

  const complete = calculateTodayProgress({
    dailyMinutes: 20,
    completionMinutes: 30,
  });
  assert.equal(complete.dailyPendingMinutes, 0);
  assert.equal(complete.overachievedMinutes, 10);
  assert.equal(complete.bowlLevel, "full");

  const almostComplete = calculateTodayProgress({
    dailyMinutes: 20,
    completionMinutes: 19,
  });
  assert.equal(almostComplete.foodRatio, 0.95);
  assert.equal(almostComplete.bowlLevel, "normal");
});

test("using a rest day completes the selected daily task", () => {
  const progress = calculateTodayProgress({
    dailyMinutes: 20,
    completionMinutes: 5,
    restDayUsed: true,
  });

  assert.equal(progress.dailyCompletedMinutes, 20);
  assert.equal(progress.dailyPendingMinutes, 0);
  assert.equal(progress.overachievedMinutes, 5);
  assert.equal(progress.bowlLevel, "full");
});

test("dashboard reads the current month and builds daily calendar states", async () => {
  const supabase = createSupabaseMock({
    exercise_profiles: [
      { user_id: USER_ID, daily_minutes: 40, monthly_rest_days: 3 },
      { user_id: OTHER_USER_ID, daily_minutes: 90, monthly_rest_days: 9 },
    ],
    exercise_daily_goal_changes: [
      { user_id: USER_ID, effective_date: "2026-08-03", daily_minutes: 20 },
      { user_id: USER_ID, effective_date: "2026-08-04", daily_minutes: 40 },
      { user_id: OTHER_USER_ID, effective_date: "2026-08-03", daily_minutes: 90 },
    ],
    exercise_completion_events: [
      { user_id: USER_ID, completion_date: "2026-08-01", minutes: 20 },
      { user_id: USER_ID, completion_date: "2026-08-03", minutes: 8 },
      { user_id: OTHER_USER_ID, completion_date: "2026-08-03", minutes: 90 },
    ],
    exercise_daily_rest_days: [
      { user_id: USER_ID, rest_date: "2026-07-31" },
      { user_id: USER_ID, rest_date: "2026-08-02" },
      { user_id: OTHER_USER_ID, rest_date: "2026-08-03" },
    ],
  });

  const dashboard = await getExerciseDashboard(supabase, USER_ID, AUGUST_THIRD_CHINA);

  assert.deepEqual(dashboard.profile, {
    daily_minutes: 40,
    monthly_rest_days: 3,
  });
  assert.deepEqual(dashboard.today, {
    date: "2026-08-03",
    completed: false,
    daily_minutes: 20,
    daily_completed_minutes: 8,
    daily_pending_minutes: 12,
    recorded_minutes: 8,
    overachieved_minutes: 0,
    completed_minutes: 8,
    target_minutes: 20,
  });
  assert.deepEqual(dashboard.rest_days, {
    used: 1,
    total: 3,
    remaining: 2,
    used_today: false,
  });
  assert.equal(dashboard.month.year, 2026);
  assert.equal(dashboard.month.month, 8);
  assert.equal(dashboard.month.days_in_month, 31);
  assert.equal(dashboard.month.first_weekday, 5);
  assert.equal(dashboard.month.completed_days, 0);
  assert.deepEqual(dashboard.month.days.slice(0, 4), [
    {
      date: "2026-08-01", day: 1, state: "untracked", rest_used: false,
      can_use_rest_day: false,
    },
    {
      date: "2026-08-02", day: 2, state: "untracked", rest_used: false,
      can_use_rest_day: false,
    },
    {
      date: "2026-08-03", day: 3, state: "incomplete", rest_used: false,
      can_use_rest_day: true,
    },
    {
      date: "2026-08-04", day: 4, state: "future", rest_used: false,
      can_use_rest_day: false,
    },
  ]);
  assert.equal(dashboard.cat.bowl_level, "low");
  assert.equal(supabase.reads.length, 4);
  for (const read of supabase.reads) {
    assert.ok(
      read.filters.some(([operator, field, value]) =>
        operator === "eq" && field === "user_id" && value === USER_ID
      ),
      `${read.table} must be filtered with the authenticated user`,
    );
  }
});

test("calendar counts days whose daily task is complete", async () => {
  const supabase = createSupabaseMock({
    exercise_profiles: [
      { user_id: USER_ID, daily_minutes: 20, monthly_rest_days: 3 },
    ],
    exercise_daily_goal_changes: [
      { user_id: USER_ID, effective_date: "2026-08-01", daily_minutes: 20 },
    ],
    exercise_completion_events: [
      { user_id: USER_ID, completion_date: "2026-08-01", minutes: 20 },
      { user_id: USER_ID, completion_date: "2026-08-02", minutes: 5 },
      { user_id: USER_ID, completion_date: "2026-08-03", minutes: 10 },
    ],
    exercise_daily_rest_days: [
      { user_id: USER_ID, rest_date: "2026-08-02" },
    ],
  });

  const dashboard = await getExerciseDashboard(supabase, USER_ID, AUGUST_THIRD_CHINA);

  assert.equal(dashboard.month.completed_days, 2);
  assert.deepEqual(
    dashboard.month.days.slice(0, 3).map((item) => item.state),
    ["completed", "completed", "incomplete"],
  );
});

test("a rest day can be applied to a selected tracked date in the current month", async () => {
  const supabase = createSupabaseMock({
    exercise_profiles: [
      { user_id: USER_ID, daily_minutes: 20, monthly_rest_days: 3 },
    ],
    exercise_daily_goal_changes: [
      { user_id: USER_ID, effective_date: "2026-08-01", daily_minutes: 20 },
    ],
  });

  await consumeExerciseRestDay(
    supabase,
    USER_ID,
    { date: "2026-08-02" },
    AUGUST_THIRD_CHINA,
  );

  assert.deepEqual(supabase.rpcCalls, [{
    name: "use_exercise_daily_rest_day",
    args: { p_user_id: USER_ID, p_rest_date: "2026-08-02" },
  }]);
});

test("a rest day cannot be applied to a future date", async () => {
  const supabase = createSupabaseMock({});

  await assert.rejects(
    consumeExerciseRestDay(
      supabase,
      USER_ID,
      { date: "2026-08-04" },
      AUGUST_THIRD_CHINA,
    ),
    { code: "INVALID_EXERCISE_REST_DATE" },
  );
  assert.equal(supabase.rpcCalls.length, 0);
});

test("daily goal settings migration applies new goals from the next day", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202608030002_exercise_next_day_settings.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.exercise_daily_goal_changes/i);
  assert.match(migration, /effective_date date not null/i);
  assert.match(migration, /create or replace function public\.save_exercise_profile_for_next_day/i);
  assert.match(migration, /p_effective_date <= p_current_date/i);
});

test("daily exercise migration stores rest days and completion records", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202608030001_exercise_daily_tasks.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.exercise_daily_rest_days/i);
  assert.match(migration, /unique \(user_id, rest_date\)/i);
  assert.match(migration, /create or replace function public\.record_exercise_daily_completion/i);
  assert.match(migration, /create or replace function public\.use_exercise_daily_rest_day/i);
  assert.match(migration, /create or replace function public\.reset_exercise_daily_state/i);
});
