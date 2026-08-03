import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  calculateTodayProgress,
  getExerciseDashboard,
} from "./lib/exercise.mjs";

const USER_ID = "10000000-0000-4000-8000-000000000002";
const OTHER_USER_ID = "10000000-0000-4000-8000-000000000003";
const AUGUST_THIRD_CHINA = new Date("2026-08-02T16:00:00.000Z");

function createSupabaseMock(tables) {
  const reads = [];
  return {
    reads,
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
    extraMinutes: 0,
    completionMinutes: 0,
  });

  assert.equal(progress.dailyPendingMinutes, 20);
  assert.equal(progress.completedMinutes, 0);
  assert.equal(progress.overachievedMinutes, 0);
  assert.equal(progress.foodRatio, 0);
  assert.equal(progress.bowlLevel, "empty");
});

test("the bowl reflects only today's daily and extra completion ratio", () => {
  const partial = calculateTodayProgress({
    dailyMinutes: 20,
    extraMinutes: 10,
    completionMinutes: 15,
  });
  assert.equal(partial.dailyCompletedMinutes, 15);
  assert.equal(partial.dailyPendingMinutes, 5);
  assert.equal(partial.extraCompletedMinutes, 0);
  assert.equal(partial.extraPendingMinutes, 10);
  assert.equal(partial.foodRatio, 0.5);
  assert.equal(partial.bowlLevel, "normal");

  const complete = calculateTodayProgress({
    dailyMinutes: 20,
    extraMinutes: 10,
    completionMinutes: 30,
  });
  assert.equal(complete.dailyPendingMinutes, 0);
  assert.equal(complete.extraPendingMinutes, 0);
  assert.equal(complete.overachievedMinutes, 0);
  assert.equal(complete.bowlLevel, "full");

  const almostComplete = calculateTodayProgress({
    dailyMinutes: 20,
    completionMinutes: 19,
  });
  assert.equal(almostComplete.foodRatio, 0.95);
  assert.equal(almostComplete.bowlLevel, "normal");
});

test("same-day extra tasks consume previously overachieved minutes", () => {
  const beforeExtraTask = calculateTodayProgress({
    dailyMinutes: 20,
    extraMinutes: 0,
    completionMinutes: 30,
  });
  assert.equal(beforeExtraTask.dailyPendingMinutes, 0);
  assert.equal(beforeExtraTask.overachievedMinutes, 10);

  const afterExtraTask = calculateTodayProgress({
    dailyMinutes: 20,
    extraMinutes: 15,
    completionMinutes: 30,
  });
  assert.equal(afterExtraTask.extraCompletedMinutes, 10);
  assert.equal(afterExtraTask.extraPendingMinutes, 5);
  assert.equal(afterExtraTask.overachievedMinutes, 0);
});

test("using a rest day completes today's daily task without consuming extra exercise", () => {
  const progress = calculateTodayProgress({
    dailyMinutes: 20,
    extraMinutes: 10,
    completionMinutes: 5,
    restDayUsed: true,
  });

  assert.equal(progress.dailyCompletedMinutes, 20);
  assert.equal(progress.dailyPendingMinutes, 0);
  assert.equal(progress.extraCompletedMinutes, 5);
  assert.equal(progress.extraPendingMinutes, 5);
  assert.equal(progress.overachievedMinutes, 0);
  assert.equal(progress.bowlLevel, "normal");
});

test("extra tasks added after a rest day remain required", () => {
  const progress = calculateTodayProgress({
    dailyMinutes: 20,
    extraMinutes: 10,
    completionMinutes: 0,
    restDayUsed: true,
  });

  assert.equal(progress.dailyPendingMinutes, 0);
  assert.equal(progress.extraPendingMinutes, 10);
  assert.equal(progress.foodRatio, 2 / 3);
  assert.equal(progress.bowlLevel, "normal");
});

test("dashboard reads only today's tasks and completions plus this month's rest days", async () => {
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
    exercise_daily_extra_tasks: [
      { user_id: USER_ID, task_date: "2026-08-02", minutes: 30 },
      { user_id: USER_ID, task_date: "2026-08-03", minutes: 10 },
      { user_id: OTHER_USER_ID, task_date: "2026-08-03", minutes: 90 },
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
    extra_minutes: 10,
    extra_completed_minutes: 0,
    extra_pending_minutes: 10,
    recorded_minutes: 8,
    overachieved_minutes: 0,
    completed_minutes: 8,
    target_minutes: 30,
  });
  assert.deepEqual(dashboard.rest_days, {
    used: 1,
    total: 3,
    remaining: 2,
    used_today: false,
  });
  assert.equal(dashboard.cat.bowl_level, "low");
  assert.equal(supabase.reads.length, 5);
  for (const read of supabase.reads) {
    assert.ok(
      read.filters.some(([operator, field, value]) =>
        operator === "eq" && field === "user_id" && value === USER_ID
      ),
      `${read.table} must be filtered with the authenticated user`,
    );
  }
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

test("daily exercise migration stores extras and rest days without month tasks", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202608030001_exercise_daily_tasks.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.exercise_daily_extra_tasks/i);
  assert.match(migration, /task_date date not null/i);
  assert.match(migration, /create table if not exists public\.exercise_daily_rest_days/i);
  assert.match(migration, /unique \(user_id, rest_date\)/i);
  assert.match(migration, /create or replace function public\.add_exercise_daily_extra_task/i);
  assert.match(migration, /create or replace function public\.record_exercise_daily_completion/i);
  assert.match(migration, /create or replace function public\.use_exercise_daily_rest_day/i);
  assert.match(migration, /create or replace function public\.reset_exercise_daily_state/i);
});
