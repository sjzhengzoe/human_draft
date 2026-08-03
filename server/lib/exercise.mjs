import { assertCondition } from "./errors.mjs";
import { throwSupabaseError } from "./supabase.mjs";

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

function monthContext(now = new Date()) {
  const { year, month, day } = datePartsInChina(now);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    today: dateString(year, month, day),
    monthStart: dateString(year, month, 1),
    monthEnd: dateString(year, month, daysInMonth),
  };
}

function sumMinutes(rows = []) {
  return rows.reduce((total, row) => total + Number(row.minutes || 0), 0);
}

export function calculateTodayProgress({
  dailyMinutes,
  extraMinutes = 0,
  completionMinutes = 0,
  restDayUsed = false,
}) {
  const targetDailyMinutes = Math.max(0, Number(dailyMinutes || 0));
  const targetExtraMinutes = Math.max(0, Number(extraMinutes || 0));
  const recordedMinutes = Math.max(0, Number(completionMinutes || 0));
  const dailyCompletedMinutes = restDayUsed
    ? targetDailyMinutes
    : Math.min(targetDailyMinutes, recordedMinutes);
  const minutesAvailableForExtra = restDayUsed
    ? recordedMinutes
    : Math.max(0, recordedMinutes - dailyCompletedMinutes);
  const extraCompletedMinutes = Math.min(targetExtraMinutes, minutesAvailableForExtra);
  const appliedRecordedMinutes = restDayUsed
    ? extraCompletedMinutes
    : dailyCompletedMinutes + extraCompletedMinutes;
  const overachievedMinutes = Math.max(0, recordedMinutes - appliedRecordedMinutes);
  const dailyPendingMinutes = Math.max(0, targetDailyMinutes - dailyCompletedMinutes);
  const extraPendingMinutes = Math.max(0, targetExtraMinutes - extraCompletedMinutes);
  const completedMinutes = dailyCompletedMinutes + extraCompletedMinutes;
  const targetMinutes = targetDailyMinutes + targetExtraMinutes;
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
    extraMinutes: targetExtraMinutes,
    extraCompletedMinutes,
    extraPendingMinutes,
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

export async function getExerciseDashboard(supabase, userId, now = new Date()) {
  const context = monthContext(now);
  const [profileResult, goalResult, completionResult, extraResult, restDayResult] = await Promise.all([
    supabase
      .from("exercise_profiles")
      .select("daily_minutes,monthly_rest_days")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("exercise_daily_goal_changes")
      .select("daily_minutes,effective_date")
      .eq("user_id", userId)
      .lte("effective_date", context.today)
      .order("effective_date", { ascending: true }),
    supabase
      .from("exercise_completion_events")
      .select("minutes")
      .eq("user_id", userId)
      .eq("completion_date", context.today)
      .order("created_at", { ascending: true }),
    supabase
      .from("exercise_daily_extra_tasks")
      .select("minutes")
      .eq("user_id", userId)
      .eq("task_date", context.today)
      .order("created_at", { ascending: true }),
    supabase
      .from("exercise_daily_rest_days")
      .select("rest_date")
      .eq("user_id", userId)
      .gte("rest_date", context.monthStart)
      .lte("rest_date", context.monthEnd)
      .order("rest_date", { ascending: true }),
  ]);
  throwSupabaseError(profileResult.error, "读取运动设置失败。");
  if (goalResult.error && !["42P01", "PGRST205"].includes(goalResult.error.code)) {
    throwSupabaseError(goalResult.error, "读取今日运动目标失败。");
  }
  throwSupabaseError(completionResult.error, "读取今日完成记录失败。");
  throwSupabaseError(extraResult.error, "读取今日加餐任务失败。");
  throwSupabaseError(restDayResult.error, "读取休息日状态失败。");

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
  const restDays = restDayResult.data || [];
  const restDayUsedToday = restDays.some((item) => item.rest_date === context.today);
  const progress = calculateTodayProgress({
    dailyMinutes: currentDailyMinutes,
    extraMinutes: sumMinutes(extraResult.data),
    completionMinutes: sumMinutes(completionResult.data),
    restDayUsed: restDayUsedToday,
  });
  const restDaysUsed = restDays.length;

  return {
    profile,
    today: {
      date: context.today,
      completed: progress.dailyPendingMinutes === 0
        && progress.extraPendingMinutes === 0,
      daily_minutes: progress.dailyMinutes,
      daily_completed_minutes: progress.dailyCompletedMinutes,
      daily_pending_minutes: progress.dailyPendingMinutes,
      extra_minutes: progress.extraMinutes,
      extra_completed_minutes: progress.extraCompletedMinutes,
      extra_pending_minutes: progress.extraPendingMinutes,
      recorded_minutes: progress.recordedMinutes,
      overachieved_minutes: progress.overachievedMinutes,
      completed_minutes: progress.completedMinutes,
      target_minutes: progress.targetMinutes,
    },
    rest_days: {
      used: restDaysUsed,
      total: profile.monthly_rest_days,
      remaining: Math.max(0, profile.monthly_rest_days - restDaysUsed),
      used_today: restDayUsedToday,
    },
    cat: {
      food_ratio: Number(progress.foodRatio.toFixed(3)),
      bowl_level: progress.bowlLevel,
      bowl_label: progress.bowlLabel,
      emotion: progress.emotion,
      emotion_label: progress.emotionLabel,
      status_text: progress.statusText,
      pace_gap_minutes: progress.dailyPendingMinutes + progress.extraPendingMinutes,
    },
  };
}

export async function saveExerciseSettings(supabase, userId, body, now = new Date()) {
  const dailyMinutes = integerValue(body.daily_minutes, "每日运动分钟数", 1, 300);
  const monthlyRestDays = integerValue(body.monthly_rest_days, "每月休息天数", 0, 28);
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
    P0005: {
      statusCode: 409,
      code: "EXERCISE_REST_DAYS_BELOW_USED",
      message: "每月休息天数不能少于本月已使用天数。",
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

export async function consumeExerciseRestDay(supabase, userId, now = new Date()) {
  const dashboard = await getExerciseDashboard(supabase, userId, now);
  assertCondition(
    dashboard.today.daily_pending_minutes > 0,
    409,
    "EXERCISE_DAILY_ALREADY_COMPLETED",
    "今日日常任务已经完成。",
  );
  const context = monthContext(now);
  const { error } = await supabase.rpc("use_exercise_daily_rest_day", {
    p_user_id: userId,
    p_rest_date: context.today,
  });
  throwSupabaseError(error, "使用休息日失败。", {
    P0003: {
      statusCode: 409,
      code: "EXERCISE_REST_DAY_ALREADY_USED_TODAY",
      message: "今天已经使用过休息日了。",
    },
    P0004: {
      statusCode: 409,
      code: "EXERCISE_REST_DAYS_EXHAUSTED",
      message: "本月休息日已经用完了。",
    },
  });
  return getExerciseDashboard(supabase, userId, now);
}

export async function addExerciseTask(supabase, userId, body, now = new Date()) {
  const minutes = integerValue(body.minutes, "加餐任务分钟数", 1, 10_000);
  const context = monthContext(now);
  const { error } = await supabase.rpc("add_exercise_daily_extra_task", {
    p_user_id: userId,
    p_task_date: context.today,
    p_minutes: minutes,
  });
  throwSupabaseError(error, "添加加餐任务失败。");
  return getExerciseDashboard(supabase, userId, now);
}

export async function completeExerciseTasks(supabase, userId, body, now = new Date()) {
  const minutes = integerValue(body.minutes, "完成分钟数", 1, 10_000);
  const context = monthContext(now);
  const { error } = await supabase.rpc("record_exercise_daily_completion", {
    p_user_id: userId,
    p_completion_date: context.today,
    p_minutes: minutes,
  });
  throwSupabaseError(error, "记录运动失败。");
  return getExerciseDashboard(supabase, userId, now);
}
