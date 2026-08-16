import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  calculateTodayProgress,
  completeExerciseTasks,
  consumeExerciseRestDay,
  getExerciseDashboard,
  revokeExerciseRestDay,
} from "../domains/exercise/service.mjs";

const UID = "1000000001";
const OTHER_UID = "1000000102";
const AUGUST_THIRD_CHINA = new Date("2026-08-02T16:00:00.000Z");

function createSupabaseMock(tables) {
  const reads = [];
  const rpcCalls = [];
  return {
    reads,
    rpcCalls,
    async rpc(name, args) {
      if (name === "get_exercise_rest_credit_summary") {
        const configured = tables.exercise_rest_credit_summary?.[0];
        const profile = (tables.exercise_profiles || []).find(
          (item) => item.uid === args.p_uid,
        );
        return {
          data: [{
            balance: configured?.balance ?? profile?.monthly_rest_days ?? 4,
            monthly_grant: configured?.monthly_grant ?? profile?.monthly_rest_days ?? 4,
          }],
          error: null,
        };
      }
      rpcCalls.push({ name, args });
      if (name === "use_exercise_daily_rest_day") {
        tables.exercise_daily_rest_days ||= [];
        tables.exercise_daily_rest_days.push({
          uid: args.p_uid,
          rest_date: args.p_rest_date,
        });
        if (tables.exercise_rest_credit_summary?.[0]) {
          tables.exercise_rest_credit_summary[0].balance -= 1;
        }
      }
      if (name === "revoke_exercise_daily_rest_day") {
        const restDayIndex = (tables.exercise_daily_rest_days || []).findIndex(
          (item) => item.uid === args.p_uid && item.rest_date === args.p_rest_date,
        );
        if (restDayIndex < 0) return { error: { code: "P0007", message: "not used" } };
        tables.exercise_daily_rest_days.splice(restDayIndex, 1);
        if (tables.exercise_rest_credit_summary?.[0]) {
          tables.exercise_rest_credit_summary[0].balance += 1;
        }
      }
      return { error: null };
    },
    from(table) {
      const filters = [];
      let operation = "read";
      const query = {
        select() {
          return query;
        },
        delete() {
          operation = "delete";
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
          if (operation === "delete") {
            const matchingRows = new Set(matching);
            tables[table] = (tables[table] || []).filter((row) => !matchingRows.has(row));
          }
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
      { uid: UID, daily_minutes: 40, monthly_rest_days: 3 },
      { uid: OTHER_UID, daily_minutes: 90, monthly_rest_days: 9 },
    ],
    exercise_daily_goal_changes: [
      { uid: UID, effective_date: "2026-08-03", daily_minutes: 20 },
      { uid: UID, effective_date: "2026-08-04", daily_minutes: 40 },
      { uid: OTHER_UID, effective_date: "2026-08-03", daily_minutes: 90 },
    ],
    exercise_completion_events: [
      { uid: UID, completion_date: "2026-08-01", minutes: 20 },
      { uid: UID, completion_date: "2026-08-03", minutes: 8 },
      { uid: OTHER_UID, completion_date: "2026-08-03", minutes: 90 },
    ],
    exercise_daily_rest_days: [
      { uid: UID, rest_date: "2026-07-31" },
      { uid: UID, rest_date: "2026-08-02" },
      { uid: OTHER_UID, rest_date: "2026-08-03" },
    ],
  });

  const dashboard = await getExerciseDashboard(supabase, UID, AUGUST_THIRD_CHINA);

  assert.deepEqual(dashboard.profile, {
    daily_minutes: 40,
    monthly_rest_days: 3,
  });
  assert.deepEqual(dashboard.today, {
    date: "2026-08-03",
    completed: false,
    pending_minutes: 12,
    extra_pending_minutes: 0,
    daily_minutes: 20,
    daily_completed_minutes: 8,
    daily_pending_minutes: 12,
    recorded_minutes: 8,
    overachieved_minutes: 0,
    completed_minutes: 8,
    target_minutes: 20,
  });
  assert.deepEqual(dashboard.rest_days, {
    balance: 3,
    monthly_grant: 3,
    used_today: false,
    used: 1,
    total: 4,
    remaining: 3,
  });
  assert.deepEqual(dashboard.year, { incomplete_days: 1 });
  assert.equal(dashboard.month.year, 2026);
  assert.equal(dashboard.month.month, 8);
  assert.equal(dashboard.month.value, "2026-08");
  assert.equal(dashboard.month.month_start, "2026-08-01");
  assert.equal(dashboard.month.claimed, true);
  assert.equal(dashboard.month.remainingMinutes, 12);
  assert.equal(dashboard.month.is_current, true);
  assert.equal(dashboard.month.min_month, "2026-08");
  assert.equal(dashboard.month.max_month, "2026-08");
  assert.equal(dashboard.month.days_in_month, 31);
  assert.equal(dashboard.month.first_weekday, 5);
  assert.equal(dashboard.month.completed_days, 0);
  assert.deepEqual(dashboard.month.days.slice(0, 4), [
    {
      date: "2026-08-01", day: 1, state: "untracked", rest_used: false,
      can_use_rest_day: false, daily_minutes: null, daily_completed_minutes: null,
      daily_pending_minutes: null, recorded_minutes: null, overachieved_minutes: null,
      bowl_level: null, bowl_label: null,
    },
    {
      date: "2026-08-02", day: 2, state: "untracked", rest_used: false,
      can_use_rest_day: false, daily_minutes: null, daily_completed_minutes: null,
      daily_pending_minutes: null, recorded_minutes: null, overachieved_minutes: null,
      bowl_level: null, bowl_label: null,
    },
    {
      date: "2026-08-03", day: 3, state: "incomplete", rest_used: false,
      can_use_rest_day: true, daily_minutes: 20, daily_completed_minutes: 8,
      daily_pending_minutes: 12, recorded_minutes: 8, overachieved_minutes: 0,
      bowl_level: "low", bowl_label: "偏少",
    },
    {
      date: "2026-08-04", day: 4, state: "future", rest_used: false,
      can_use_rest_day: false, daily_minutes: null, daily_completed_minutes: null,
      daily_pending_minutes: null, recorded_minutes: null, overachieved_minutes: null,
      bowl_level: null, bowl_label: null,
    },
  ]);
  assert.equal(dashboard.cat.bowl_level, "low");
  assert.deepEqual(dashboard.claim_preview, {
    minutes: 0,
    calendar_days: 0,
    exercise_days: 0,
    rest_days: 3,
  });
  assert.equal(supabase.reads.length, 4);
  for (const read of supabase.reads) {
    assert.ok(
      read.filters.some(([operator, field, value]) =>
        operator === "eq" && field === "uid" && value === UID
      ),
      `${read.table} must be filtered with the authenticated user`,
    );
  }
});

test("dashboard can display a historical month without changing today's progress", async () => {
  const supabase = createSupabaseMock({
    exercise_profiles: [
      { uid: UID, daily_minutes: 20, monthly_rest_days: 3 },
    ],
    exercise_daily_goal_changes: [
      { uid: UID, effective_date: "2026-07-01", daily_minutes: 20 },
    ],
    exercise_completion_events: [
      { uid: UID, completion_date: "2026-07-01", minutes: 20 },
      { uid: UID, completion_date: "2026-07-02", minutes: 5 },
      { uid: UID, completion_date: "2026-08-03", minutes: 10 },
    ],
    exercise_daily_rest_days: [
      { uid: UID, rest_date: "2026-07-02" },
    ],
  });

  const dashboard = await getExerciseDashboard(
    supabase,
    UID,
    AUGUST_THIRD_CHINA,
    "2026-07",
  );

  assert.equal(dashboard.today.date, "2026-08-03");
  assert.equal(dashboard.today.daily_pending_minutes, 10);
  assert.deepEqual(dashboard.rest_days, {
    balance: 3,
    monthly_grant: 3,
    used_today: false,
    used: 0,
    total: 3,
    remaining: 3,
  });
  assert.equal(dashboard.month.value, "2026-07");
  assert.equal(dashboard.month.is_current, false);
  assert.equal(dashboard.month.completed_days, 2);
  assert.deepEqual(
    dashboard.month.days.slice(0, 3).map((item) => ({
      state: item.state,
      canUseRestDay: item.can_use_rest_day,
    })),
    [
      { state: "completed", canUseRestDay: false },
      { state: "completed", canUseRestDay: false },
      { state: "incomplete", canUseRestDay: true },
    ],
  );
  assert.equal(supabase.reads.length, 4);
});

test("dashboard rejects future calendar months", async () => {
  const supabase = createSupabaseMock({});

  await assert.rejects(
    getExerciseDashboard(supabase, UID, AUGUST_THIRD_CHINA, "2026-09"),
    { code: "FUTURE_EXERCISE_MONTH" },
  );
  assert.equal(supabase.reads.length, 0);
});

test("calendar counts days whose daily task is complete", async () => {
  const supabase = createSupabaseMock({
    exercise_profiles: [
      { uid: UID, daily_minutes: 20, monthly_rest_days: 3 },
    ],
    exercise_daily_goal_changes: [
      { uid: UID, effective_date: "2026-08-01", daily_minutes: 20 },
    ],
    exercise_completion_events: [
      { uid: UID, completion_date: "2026-08-01", minutes: 20 },
      { uid: UID, completion_date: "2026-08-02", minutes: 5 },
      { uid: UID, completion_date: "2026-08-03", minutes: 10 },
    ],
    exercise_daily_rest_days: [
      { uid: UID, rest_date: "2026-08-02" },
    ],
  });

  const dashboard = await getExerciseDashboard(supabase, UID, AUGUST_THIRD_CHINA);

  assert.equal(dashboard.month.completed_days, 2);
  assert.deepEqual(
    dashboard.month.days.slice(0, 3).map((item) => item.state),
    ["completed", "completed", "incomplete"],
  );
});

test("a rest day can be applied to a selected tracked date in the current month", async () => {
  const supabase = createSupabaseMock({
    exercise_profiles: [
      { uid: UID, daily_minutes: 20, monthly_rest_days: 3 },
    ],
    exercise_daily_goal_changes: [
      { uid: UID, effective_date: "2026-08-01", daily_minutes: 20 },
    ],
  });

  const dashboard = await consumeExerciseRestDay(
    supabase,
    UID,
    { date: "2026-08-02" },
    AUGUST_THIRD_CHINA,
  );

  assert.deepEqual(supabase.rpcCalls, [{
    name: "use_exercise_daily_rest_day",
    args: { p_uid: UID, p_rest_date: "2026-08-02" },
  }]);
  assert.equal(dashboard.month.value, "2026-08");
});

test("a historical rest day consumes the user's cumulative balance", async () => {
  const supabase = createSupabaseMock({
    exercise_profiles: [
      { uid: UID, daily_minutes: 20, monthly_rest_days: 5 },
    ],
    exercise_daily_goal_changes: [
      {
        uid: UID,
        effective_date: "2026-07-01",
        daily_minutes: 20,
        monthly_rest_days: 2,
      },
      {
        uid: UID,
        effective_date: "2026-08-01",
        daily_minutes: 20,
        monthly_rest_days: 5,
      },
    ],
    exercise_daily_rest_days: [
      { uid: UID, rest_date: "2026-07-01" },
    ],
  });

  const dashboard = await consumeExerciseRestDay(
    supabase,
    UID,
    { date: "2026-07-02" },
    AUGUST_THIRD_CHINA,
  );

  assert.deepEqual(supabase.rpcCalls, [{
    name: "use_exercise_daily_rest_day",
    args: { p_uid: UID, p_rest_date: "2026-07-02" },
  }]);
  assert.equal(dashboard.month.value, "2026-07");
});

test("a rest day cannot be applied to a future date", async () => {
  const supabase = createSupabaseMock({});

  await assert.rejects(
    consumeExerciseRestDay(
      supabase,
      UID,
      { date: "2026-08-04" },
      AUGUST_THIRD_CHINA,
    ),
    { code: "INVALID_EXERCISE_REST_DATE" },
  );
  assert.equal(supabase.rpcCalls.length, 0);
});

test("a used rest day can be revoked and refunded", async () => {
  const supabase = createSupabaseMock({
    exercise_profiles: [
      { uid: UID, daily_minutes: 20, monthly_rest_days: 3 },
    ],
    exercise_daily_goal_changes: [
      { uid: UID, effective_date: "2026-08-01", daily_minutes: 20 },
    ],
    exercise_completion_events: [],
    exercise_daily_rest_days: [
      { uid: UID, rest_date: "2026-08-02" },
      { uid: OTHER_UID, rest_date: "2026-08-02" },
    ],
    exercise_rest_credit_summary: [{ balance: 2, monthly_grant: 3 }],
  });

  const dashboard = await revokeExerciseRestDay(
    supabase,
    UID,
    { date: "2026-08-02" },
    AUGUST_THIRD_CHINA,
  );

  assert.equal(dashboard.rest_days.balance, 3);
  assert.deepEqual(supabase.rpcCalls, [{
    name: "revoke_exercise_daily_rest_day",
    args: { p_uid: UID, p_rest_date: "2026-08-02" },
  }]);
});

test("rest-day revocation supports historical dates and rejects unused dates", async () => {
  const historicalSupabase = createSupabaseMock({
    exercise_profiles: [{ uid: UID, daily_minutes: 20, monthly_rest_days: 3 }],
    exercise_daily_goal_changes: [
      { uid: UID, effective_date: "2026-07-01", daily_minutes: 20 },
    ],
    exercise_daily_rest_days: [{ uid: UID, rest_date: "2026-07-31" }],
  });
  const historicalDashboard = await revokeExerciseRestDay(
    historicalSupabase,
    UID,
    { date: "2026-07-31" },
    AUGUST_THIRD_CHINA,
  );
  assert.equal(historicalDashboard.month.value, "2026-07");

  const unusedSupabase = createSupabaseMock({
    exercise_daily_rest_days: [],
  });
  await assert.rejects(
    revokeExerciseRestDay(
      unusedSupabase,
      UID,
      { date: "2026-08-02" },
      AUGUST_THIRD_CHINA,
    ),
    { code: "EXERCISE_REST_DAY_NOT_USED" },
  );
});

test("a tracked past date can receive a missed exercise completion", async () => {
  const supabase = createSupabaseMock({
    exercise_profiles: [
      { uid: UID, daily_minutes: 20, monthly_rest_days: 3 },
    ],
    exercise_daily_goal_changes: [
      { uid: UID, effective_date: "2026-08-01", daily_minutes: 20 },
    ],
    exercise_completion_events: [],
    exercise_daily_rest_days: [],
  });

  const dashboard = await completeExerciseTasks(
    supabase,
    UID,
    { date: "2026-08-02", minutes: 20 },
    AUGUST_THIRD_CHINA,
  );

  assert.deepEqual(supabase.rpcCalls, [{
    name: "record_exercise_daily_completion",
    args: {
      p_uid: UID,
      p_completion_date: "2026-08-02",
      p_minutes: 20,
    },
  }]);
  assert.equal(dashboard.month.value, "2026-08");
});

test("exercise completion rejects future, invalid, and untracked dates", async () => {
  for (const date of ["2026-08-04", "2026-02-31"]) {
    const supabase = createSupabaseMock({});
    await assert.rejects(
      completeExerciseTasks(
        supabase,
        UID,
        { date, minutes: 20 },
        AUGUST_THIRD_CHINA,
      ),
      { code: "INVALID_EXERCISE_COMPLETION_DATE" },
    );
    assert.equal(supabase.rpcCalls.length, 0);
  }

  const untrackedSupabase = createSupabaseMock({
    exercise_daily_goal_changes: [],
  });
  await assert.rejects(
    completeExerciseTasks(
      untrackedSupabase,
      UID,
      { date: "2026-08-02", minutes: 20 },
      AUGUST_THIRD_CHINA,
    ),
    { code: "EXERCISE_DATE_NOT_TRACKED" },
  );
  assert.equal(untrackedSupabase.rpcCalls.length, 0);
});

test("exercise home lets a tracked calendar day drive the completion date", async () => {
  const [pageSource, templateSource] = await Promise.all([
    readFile(new URL("../../src/exercise/pages/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/exercise/pages/index.wxml", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /handleCalendarDayTap/);
  assert.match(pageSource, /completeExercise\(minutes, selectedDate\)/);
  assert.match(pageSource, /consumeExerciseRestDay\(selectedDate\)/);
  assert.match(pageSource, /revokeExerciseRestDay\(selectedDate\)/);
  assert.match(templateSource, /data-date="\{\{item\.date\}\}"/);
  assert.match(templateSource, /bindtap="handleCalendarDayTap"/);
  assert.match(templateSource, /wx:if="\{\{item\.restUsed\}\}" class="calendar-day__corner-mark">休<\/text>[\s\S]*?wx:elif="\{\{item\.state === 'completed' \|\| item\.state === 'incomplete'\}\}"[\s\S]*?class="calendar-day__corner-mark"[\s\S]*?>\{\{item\.day\}\}<\/text>/);
  assert.match(templateSource, /\{\{selectedTaskTitle\}\}/);
  assert.match(templateSource, /\{\{restCreditBalance\}\}/);
  assert.match(templateSource, /本年未完成 \{\{yearIncompleteDays\}\} 天/);
  assert.match(templateSource, /bindtap="handleUseRestDay"/);
  assert.doesNotMatch(pageSource, /pages\/rest-days\/index/);
});

test("exercise home builds a visible local calendar for signed-out visitors", async () => {
  const [pageSource, templateSource] = await Promise.all([
    readFile(new URL("../../src/exercise/pages/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/exercise/pages/index.wxml", import.meta.url), "utf8"),
  ]);

  assert.match(pageSource, /if \(!getCurrentUser\(\)\) \{[\s\S]*?this\.showGuestCalendar\(\)/);
  assert.match(pageSource, /showGuestCalendar\(\) \{[\s\S]*?guestCalendarContext\(\)/);
  assert.match(pageSource, /Array\.from\(\{ length: daysInMonth \}/);
  assert.match(pageSource, /calendarCells: context\.calendarCells/);
  assert.match(templateSource, /wx:if="\{\{guestMode\}\}">登录后查看你的运动记录/);
  assert.match(templateSource, /wx:if="\{\{guestMode\}\}" class="task-row__status">登录后开始记录/);
});

test("daily goal settings migration applies new goals from the next day", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202608030002_exercise_next_day_settings.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.exercise_daily_goal_changes/i);
  assert.match(migration, /effective_date date not null/i);
  assert.match(migration, /create or replace function public\.save_exercise_profile_for_next_day/i);
  assert.match(migration, /p_effective_date <= p_current_date/i);
});

test("rest allowance migration backfills settings history without changing activity", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202608040001_exercise_rest_day_history.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /add column if not exists monthly_rest_days integer/i);
  assert.match(migration, /set monthly_rest_days = coalesce\(profile\.monthly_rest_days, 4\)/i);
  assert.match(migration, /create or replace function public\.use_exercise_daily_rest_day/i);
  assert.match(migration, /date_trunc\('month', p_rest_date\)/i);
  assert.doesNotMatch(migration, /delete from public\.exercise_completion_events/i);
});

test("cumulative rest-credit migration preserves history and backfills an auditable balance", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202608110001_exercise_cumulative_rest_credits.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.exercise_rest_credit_events/i);
  assert.match(migration, /event_type in \('monthly_grant', 'use', 'revoke'\)/i);
  assert.match(migration, /on conflict \(user_id, event_key\) do nothing/i);
  assert.match(migration, /from public\.exercise_daily_rest_days/i);
  assert.match(migration, /create or replace function public\.revoke_exercise_daily_rest_day/i);
  assert.match(migration, /create trigger exercise_daily_rest_days_sync_credit/i);
  assert.match(migration, /next_grant_month/i);
  assert.doesNotMatch(migration, /delete from public\.exercise_daily_rest_days[\s\S]*\$backfill\$/i);
});

test("exercise cleanup migration preserves history before dropping legacy tables", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202608030003_exercise_history_cleanup.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const completionBackfill = migration.indexOf(
    "insert into public.exercise_completion_events",
  );
  const legacyCompletionDrop = migration.indexOf(
    "drop table if exists public.exercise_daily_completions",
  );
  assert.ok(completionBackfill >= 0);
  assert.ok(legacyCompletionDrop > completionBackfill);
  assert.match(migration, /insert into public\.exercise_daily_rest_days/i);
  assert.match(migration, /create or replace function public\.reset_exercise_daily_state/i);
  assert.match(migration, /drop table if exists public\.exercise_daily_extra_tasks/i);
  assert.match(migration, /drop table if exists public\.exercise_rest_day_events/i);
  assert.match(migration, /drop table if exists public\.exercise_months/i);
  assert.match(migration, /drop column if exists credit_minutes/i);
});
