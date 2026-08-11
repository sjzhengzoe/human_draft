import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";

export const DEFAULT_DAILY_MINUTES = 30;
export const DEFAULT_MONTHLY_REST_DAYS = 4;

function integerValue(value, fieldName, minimum, maximum) {
  assertCondition(
    Number.isInteger(value) && value >= minimum && value <= maximum,
    400,
    "INVALID_INTEGER",
    `${fieldName}必须在 ${minimum} 到 ${maximum} 之间。`,
  );
  return value;
}

function datePartsInChina(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function dateString(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime())
    && dateString(
      parsedDate.getUTCFullYear(),
      parsedDate.getUTCMonth() + 1,
      parsedDate.getUTCDate(),
    ) === value;
}

function monthContext(now = new Date()) {
  const { year, month, day } = datePartsInChina(now);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  return {
    year,
    month,
    day,
    daysInMonth,
    firstWeekday,
    today: dateString(year, month, day),
    monthStart: dateString(year, month, 1),
    monthEnd: dateString(year, month, daysInMonth),
  };
}

function requestedMonthContext(requestedMonth, currentContext) {
  const monthValue = requestedMonth || currentContext.today.slice(0, 7);
  assertCondition(
    /^\d{4}-(0[1-9]|1[0-2])$/.test(monthValue),
    400,
    "INVALID_EXERCISE_MONTH",
    "请选择有效的年月。",
  );
  assertCondition(
    monthValue <= currentContext.today.slice(0, 7),
    400,
    "FUTURE_EXERCISE_MONTH",
    "不能查看未来月份。",
  );
  const [year, month] = monthValue.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  return {
    value: monthValue,
    year,
    month,
    daysInMonth,
    firstWeekday,
    monthStart: dateString(year, month, 1),
    monthEnd: dateString(year, month, daysInMonth),
    isCurrent: monthValue === currentContext.today.slice(0, 7),
  };
}

function sumMinutesByDate(rows = [], dateField) {
  return rows.reduce((totals, row) => {
    const date = row[dateField];
    totals.set(date, (totals.get(date) || 0) + Number(row.minutes || 0));
    return totals;
  }, new Map());
}

function dailyGoalOnDate(goals, date, fallbackMinutes) {
  let minutes = fallbackMinutes;
  for (const goal of goals) {
    if (goal.effective_date > date) break;
    minutes = Number(goal.daily_minutes || fallbackMinutes);
  }
  return minutes;
}

function countIncompleteDays({
  startDate,
  endDate,
  trackingStartDate,
  goals,
  fallbackMinutes,
  completionMinutesByDate,
  restDates,
}) {
  const effectiveStart = startDate > trackingStartDate ? startDate : trackingStartDate;
  if (effectiveStart > endDate) return 0;
  const cursor = new Date(`${effectiveStart}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  let incompleteDays = 0;
  while (cursor <= end) {
    const date = dateString(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      cursor.getUTCDate(),
    );
    const progress = calculateTodayProgress({
      dailyMinutes: dailyGoalOnDate(goals, date, fallbackMinutes),
      completionMinutes: completionMinutesByDate.get(date) || 0,
      restDayUsed: restDates.has(date),
    });
    if (progress.dailyPendingMinutes > 0) incompleteDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return incompleteDays;
}

export function calculateTodayProgress({
  dailyMinutes,
  completionMinutes = 0,
  restDayUsed = false,
}) {
  const targetDailyMinutes = Math.max(0, Number(dailyMinutes || 0));
  const recordedMinutes = Math.max(0, Number(completionMinutes || 0));
  const dailyCompletedMinutes = restDayUsed
    ? targetDailyMinutes
    : Math.min(targetDailyMinutes, recordedMinutes);
  const appliedRecordedMinutes = restDayUsed ? 0 : dailyCompletedMinutes;
  const overachievedMinutes = Math.max(0, recordedMinutes - appliedRecordedMinutes);
  const dailyPendingMinutes = Math.max(0, targetDailyMinutes - dailyCompletedMinutes);
  const completedMinutes = dailyCompletedMinutes;
  const targetMinutes = targetDailyMinutes;
  const foodRatio = targetMinutes === 0
    ? 1
    : Math.max(0, Math.min(1, completedMinutes / targetMinutes));

  let bowlLevel = "empty";
  let bowlLabel = "没有";
  let emotion = "pitiful";
  let emotionLabel = "可可怜怜";
  let statusText = "食盆空了，今天动一动吧";
  if (foodRatio >= 1) {
    bowlLevel = "full";
    bowlLabel = "很满";
    emotion = "happy";
    emotionLabel = "高兴";
    statusText = "今天的任务完成啦，它们吃饱了";
  } else if (foodRatio >= 0.5) {
    bowlLevel = "normal";
    bowlLabel = "一般";
    emotion = "neutral";
    emotionLabel = "一般";
    statusText = "再完成一点，食盆就会变满";
  } else if (foodRatio > 0.05) {
    bowlLevel = "low";
    bowlLabel = "偏少";
    emotion = "unhappy";
    emotionLabel = "不高兴";
    statusText = "今天刚开始，它们还在等你运动";
  }

  return {
    dailyMinutes: targetDailyMinutes,
    dailyCompletedMinutes,
    dailyPendingMinutes,
    recordedMinutes,
    overachievedMinutes,
    completedMinutes,
    targetMinutes,
    foodRatio,
    bowlLevel,
    bowlLabel,
    emotion,
    emotionLabel,
    statusText,
  };
}

export async function getExerciseDashboard(
  supabase,
  userId,
  now = new Date(),
  requestedMonth = "",
) {
  const currentContext = monthContext(now);
  const calendarContext = requestedMonthContext(requestedMonth, currentContext);
  const currentYearStart = dateString(currentContext.year, 1, 1);
  const calendarSharesCurrentYear = calendarContext.year === currentContext.year;
  const activityStart = calendarSharesCurrentYear
    ? currentYearStart
    : calendarContext.monthStart;
  const activityEnd = calendarSharesCurrentYear
    ? currentContext.today
    : calendarContext.monthEnd;
  const currentYearCompletionRequest = calendarSharesCurrentYear
    ? Promise.resolve({ data: [], error: null })
    : supabase
      .from("exercise_completion_events")
      .select("minutes,completion_date")
      .eq("user_id", userId)
      .gte("completion_date", currentYearStart)
      .lte("completion_date", currentContext.today)
      .order("created_at", { ascending: true });
  const currentYearRestDayRequest = calendarSharesCurrentYear
    ? Promise.resolve({ data: [], error: null })
    : supabase
      .from("exercise_daily_rest_days")
      .select("rest_date")
      .eq("user_id", userId)
      .gte("rest_date", currentYearStart)
      .lte("rest_date", currentContext.today)
      .order("rest_date", { ascending: true });
  const [
    profileResult,
    goalResult,
    restCreditResult,
    currentYearCompletionResult,
    activityCompletionResult,
    currentYearRestDayResult,
    activityRestDayResult,
  ] = await Promise.all([
    supabase
      .from("exercise_profiles")
      .select("daily_minutes,monthly_rest_days")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("exercise_daily_goal_changes")
      .select("daily_minutes,monthly_rest_days,effective_date")
      .eq("user_id", userId)
      .lte("effective_date", currentContext.today)
      .order("effective_date", { ascending: true }),
    supabase.rpc("get_exercise_rest_credit_summary", {
      p_user_id: userId,
      p_current_date: currentContext.today,
    }),
    currentYearCompletionRequest,
    supabase
      .from("exercise_completion_events")
      .select("minutes,completion_date")
      .eq("user_id", userId)
      .gte("completion_date", activityStart)
      .lte("completion_date", activityEnd)
      .order("created_at", { ascending: true }),
    currentYearRestDayRequest,
    supabase
      .from("exercise_daily_rest_days")
      .select("rest_date")
      .eq("user_id", userId)
      .gte("rest_date", activityStart)
      .lte("rest_date", activityEnd)
      .order("rest_date", { ascending: true }),
  ]);
  throwSupabaseError(profileResult.error, "读取运动设置失败。");
  if (goalResult.error && !["42P01", "PGRST205"].includes(goalResult.error.code)) {
    throwSupabaseError(goalResult.error, "读取今日运动目标失败。");
  }
  throwSupabaseError(restCreditResult.error, "读取休息额度失败。", {
    PGRST202: {
      statusCode: 503,
      code: "EXERCISE_REST_CREDIT_MIGRATION_REQUIRED",
      message: "休息额度升级尚未完成，请稍后再试。",
    },
  });
  throwSupabaseError(currentYearCompletionResult.error, "读取本年完成记录失败。");
  throwSupabaseError(activityCompletionResult.error, "读取月度完成记录失败。");
  throwSupabaseError(currentYearRestDayResult.error, "读取本年休息日状态失败。");
  throwSupabaseError(activityRestDayResult.error, "读取月度休息日状态失败。");

  const profile = {
    daily_minutes: Number(profileResult.data?.daily_minutes || DEFAULT_DAILY_MINUTES),
    monthly_rest_days: Number(
      profileResult.data?.monthly_rest_days ?? DEFAULT_MONTHLY_REST_DAYS,
    ),
  };
  const effectiveGoals = goalResult.data || [];
  const currentDailyMinutes = Number(
    effectiveGoals.at(-1)?.daily_minutes || profile.daily_minutes,
  );
  const restCreditRow = Array.isArray(restCreditResult.data)
    ? restCreditResult.data[0]
    : restCreditResult.data;
  const restCreditBalance = Math.max(0, Number(restCreditRow?.balance || 0));
  const currentMonthGrant = Math.max(0, Number(restCreditRow?.monthly_grant || 0));
  const activityCompletionRows = activityCompletionResult.data || [];
  const currentYearCompletionRows = calendarSharesCurrentYear
    ? activityCompletionRows
    : currentYearCompletionResult.data || [];
  const activityRestDays = activityRestDayResult.data || [];
  const currentYearRestDays = calendarSharesCurrentYear
    ? activityRestDays
    : currentYearRestDayResult.data || [];
  const calendarRestDays = activityRestDays.filter(
    (item) => item.rest_date >= calendarContext.monthStart
      && item.rest_date <= calendarContext.monthEnd,
  );
  const currentRestDays = currentYearRestDays.filter(
    (item) => item.rest_date >= currentContext.monthStart
      && item.rest_date <= currentContext.monthEnd,
  );
  const currentYearCompletionMinutesByDate = sumMinutesByDate(
    currentYearCompletionRows,
    "completion_date",
  );
  const calendarCompletionMinutesByDate = sumMinutesByDate(
    activityCompletionRows,
    "completion_date",
  );
  const calendarRestDates = new Set(calendarRestDays.map((item) => item.rest_date));
  const restDayUsedToday = currentRestDays.some(
    (item) => item.rest_date === currentContext.today,
  );
  const progress = calculateTodayProgress({
    dailyMinutes: currentDailyMinutes,
    completionMinutes: currentYearCompletionMinutesByDate.get(currentContext.today) || 0,
    restDayUsed: restDayUsedToday,
  });
  const trackingStartDate = effectiveGoals[0]?.effective_date || currentContext.today;
  const calendarDays = Array.from({ length: calendarContext.daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = dateString(calendarContext.year, calendarContext.month, day);
    let state = "future";
    let restUsed = false;
    let canUseRestDay = false;
    let dayProgress = null;
    if (date <= currentContext.today) {
      if (date < trackingStartDate) {
        state = "untracked";
      } else {
        restUsed = calendarRestDates.has(date);
        dayProgress = calculateTodayProgress({
          dailyMinutes: dailyGoalOnDate(effectiveGoals, date, profile.daily_minutes),
          completionMinutes: calendarCompletionMinutesByDate.get(date) || 0,
          restDayUsed: restUsed,
        });
        canUseRestDay = !restUsed
          && dayProgress.dailyPendingMinutes > 0
          && restCreditBalance > 0;
        state = dayProgress.dailyPendingMinutes === 0
          ? "completed"
          : "incomplete";
      }
    }
    return {
      date,
      day,
      state,
      rest_used: restUsed,
      can_use_rest_day: canUseRestDay,
      daily_minutes: dayProgress?.dailyMinutes ?? null,
      daily_completed_minutes: dayProgress?.dailyCompletedMinutes ?? null,
      daily_pending_minutes: dayProgress?.dailyPendingMinutes ?? null,
      recorded_minutes: dayProgress?.recordedMinutes ?? null,
      overachieved_minutes: dayProgress?.overachievedMinutes ?? null,
      bowl_level: dayProgress?.bowlLevel ?? null,
      bowl_label: dayProgress?.bowlLabel ?? null,
    };
  });
  const completedDays = calendarDays.filter((item) => item.state === "completed").length;
  const currentYearIncompleteDays = countIncompleteDays({
    startDate: currentYearStart,
    endDate: currentContext.today,
    trackingStartDate,
    goals: effectiveGoals,
    fallbackMinutes: profile.daily_minutes,
    completionMinutesByDate: currentYearCompletionMinutesByDate,
    restDates: new Set(currentYearRestDays.map((item) => item.rest_date)),
  });

  return {
    profile,
    today: {
      date: currentContext.today,
      completed: progress.dailyPendingMinutes === 0,
      daily_minutes: progress.dailyMinutes,
      daily_completed_minutes: progress.dailyCompletedMinutes,
      daily_pending_minutes: progress.dailyPendingMinutes,
      recorded_minutes: progress.recordedMinutes,
      overachieved_minutes: progress.overachievedMinutes,
      completed_minutes: progress.completedMinutes,
      target_minutes: progress.targetMinutes,
    },
    rest_days: {
      balance: restCreditBalance,
      monthly_grant: currentMonthGrant,
      used_today: restDayUsedToday,
    },
    year: {
      incomplete_days: currentYearIncompleteDays,
    },
    month: {
      value: calendarContext.value,
      year: calendarContext.year,
      month: calendarContext.month,
      days_in_month: calendarContext.daysInMonth,
      first_weekday: calendarContext.firstWeekday,
      is_current: calendarContext.isCurrent,
      min_month: trackingStartDate.slice(0, 7),
      max_month: currentContext.today.slice(0, 7),
      completed_days: completedDays,
      rest_days: {
        used: calendarRestDays.length,
      },
      days: calendarDays,
    },
    cat: {
      food_ratio: Number(progress.foodRatio.toFixed(3)),
      bowl_level: progress.bowlLevel,
      bowl_label: progress.bowlLabel,
      emotion: progress.emotion,
      emotion_label: progress.emotionLabel,
      status_text: progress.statusText,
      pace_gap_minutes: progress.dailyPendingMinutes,
    },
  };
}

export async function saveExerciseSettings(supabase, userId, body, now = new Date()) {
  const dailyMinutes = integerValue(body.daily_minutes, "每日运动分钟数", 1, 300);
  const monthlyRestDays = integerValue(body.monthly_rest_days, "每月发放休息额度", 0, 28);
  const context = monthContext(now);
  const tomorrow = new Date(Date.UTC(
    Number(context.today.slice(0, 4)),
    Number(context.today.slice(5, 7)) - 1,
    Number(context.today.slice(8, 10)) + 1,
  ));
  const effectiveDate = dateString(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
  );
  const { error } = await supabase.rpc("save_exercise_profile_for_next_day", {
    p_user_id: userId,
    p_daily_minutes: dailyMinutes,
    p_monthly_rest_days: monthlyRestDays,
    p_current_date: context.today,
    p_effective_date: effectiveDate,
  });
  throwSupabaseError(error, "保存运动设置失败。", {
    PGRST202: {
      statusCode: 503,
      code: "EXERCISE_SETTINGS_MIGRATION_REQUIRED",
      message: "运动设置升级尚未完成，请稍后再试。",
    },
  });
  return getExerciseDashboard(supabase, userId, now);
}

export async function resetExerciseState(supabase, userId, now = new Date()) {
  const { error } = await supabase.rpc("reset_exercise_daily_state", {
    p_user_id: userId,
  });
  throwSupabaseError(error, "重置运动状态失败。");
  return getExerciseDashboard(supabase, userId, now);
}

export async function consumeExerciseRestDay(
  supabase,
  userId,
  body = {},
  now = new Date(),
) {
  const context = monthContext(now);
  const restDate = body.date || context.today;
  assertCondition(
    /^\d{4}-\d{2}-\d{2}$/.test(restDate)
      && restDate <= context.today,
    400,
    "INVALID_EXERCISE_REST_DATE",
    "只能选择不晚于今天的有效日期。",
  );
  const dashboard = await getExerciseDashboard(
    supabase,
    userId,
    now,
    restDate.slice(0, 7),
  );
  const selectedDay = dashboard.month.days.find((item) => item.date === restDate);
  assertCondition(
    dashboard.rest_days.balance > 0,
    409,
    "EXERCISE_REST_DAYS_EXHAUSTED",
    "休息额度不足。",
  );
  assertCondition(
    selectedDay && !selectedDay.rest_used && selectedDay.can_use_rest_day,
    409,
    "EXERCISE_DAILY_ALREADY_COMPLETED",
    selectedDay?.rest_used
      ? "该日期已经使用过休息日权限。"
      : "该日期的日常任务已经完成或尚未开始记录。",
  );
  const { error } = await supabase.rpc("use_exercise_daily_rest_day", {
    p_user_id: userId,
    p_rest_date: restDate,
  });
  throwSupabaseError(error, "使用休息日失败。", {
    P0003: {
      statusCode: 409,
      code: "EXERCISE_REST_DAY_ALREADY_USED_TODAY",
      message: "该日期已经使用过休息日权限。",
    },
    P0004: {
      statusCode: 409,
      code: "EXERCISE_REST_DAYS_EXHAUSTED",
      message: "休息额度不足。",
    },
    P0006: {
      statusCode: 409,
      code: "EXERCISE_DATE_NOT_TRACKED",
      message: "该日期尚未开始记录运动。",
    },
  });
  return getExerciseDashboard(supabase, userId, now, restDate.slice(0, 7));
}

export async function revokeExerciseRestDay(
  supabase,
  userId,
  body = {},
  now = new Date(),
) {
  const restDate = body.date;
  assertCondition(
    isValidDateString(restDate),
    400,
    "INVALID_EXERCISE_REVOKE_DATE",
    "请选择有效的休息日日期。",
  );
  const { error } = await supabase.rpc("revoke_exercise_daily_rest_day", {
    p_user_id: userId,
    p_rest_date: restDate,
  });
  throwSupabaseError(error, "撤回休息日失败。", {
    P0007: {
      statusCode: 409,
      code: "EXERCISE_REST_DAY_NOT_USED",
      message: "该日期没有可撤回的休息日记录。",
    },
  });
  return getExerciseDashboard(supabase, userId, now, restDate.slice(0, 7));
}

export async function completeExerciseTasks(supabase, userId, body, now = new Date()) {
  const minutes = integerValue(body.minutes, "完成分钟数", 1, 10_000);
  const context = monthContext(now);
  const completionDate = body.date || context.today;
  assertCondition(
    isValidDateString(completionDate) && completionDate <= context.today,
    400,
    "INVALID_EXERCISE_COMPLETION_DATE",
    "只能记录不晚于今天的有效日期。",
  );

  if (completionDate < context.today) {
    const goalResult = await supabase
      .from("exercise_daily_goal_changes")
      .select("effective_date")
      .eq("user_id", userId)
      .lte("effective_date", completionDate)
      .order("effective_date", { ascending: false });
    throwSupabaseError(goalResult.error, "读取运动目标历史失败。");
    assertCondition(
      (goalResult.data || []).length > 0,
      409,
      "EXERCISE_DATE_NOT_TRACKED",
      "该日期尚未开始记录运动。",
    );
  }

  const { error } = await supabase.rpc("record_exercise_daily_completion", {
    p_user_id: userId,
    p_completion_date: completionDate,
    p_minutes: minutes,
  });
  throwSupabaseError(error, "记录运动失败。");
  return getExerciseDashboard(supabase, userId, now, completionDate.slice(0, 7));
}
