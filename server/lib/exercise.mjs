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

function utcDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function daysBetween(from, to) {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86_400_000);
}

function monthContext(now = new Date()) {
  const { year, month, day } = datePartsInChina(now);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = dateString(year, month, day);
  return {
    today,
    monthStart: dateString(year, month, 1),
    monthEnd: dateString(year, month, daysInMonth),
    daysInMonth,
    remainingDays: daysInMonth - day + 1,
  };
}

export function calculateMonthlyClaim({
  dailyMinutes,
  monthlyRestDays,
  now = new Date(),
}) {
  const context = monthContext(now);
  const proratedRestDays = Math.min(
    context.remainingDays,
    Math.round((monthlyRestDays * context.remainingDays) / context.daysInMonth),
  );
  const plannedExerciseDays = Math.max(0, context.remainingDays - proratedRestDays);
  return {
    ...context,
    proratedRestDays,
    plannedExerciseDays,
    taskMinutes: plannedExerciseDays * dailyMinutes,
  };
}

export function calculateCatState({
  month,
  dailyMinutes,
  today,
}) {
  const baseMinutes = Number(month?.base_task_minutes || 0);
  const extraMinutes = Number(month?.extra_task_minutes || 0);
  const completedMinutes = Number(month?.completed_minutes || 0);
  const totalMinutes = baseMinutes + extraMinutes;
  const remainingMinutes = Math.max(0, totalMinutes - completedMinutes);

  if (totalMinutes === 0) {
    return {
      foodRatio: 0,
      bowlLevel: "empty",
      bowlLabel: "没有",
      emotion: "pitiful",
      emotionLabel: "可可怜怜",
      statusText: "领取任务后，它们会等你投喂",
      futureBaseMinutes: 0,
      paceGapMinutes: 0,
    };
  }

  const claimDate = month.claim_date || today;
  const claimEndDate = month.claim_end_date || today;
  const claimWindowDays = Math.max(1, daysBetween(claimDate, claimEndDate) + 1);
  const futureDays = Math.max(0, daysBetween(today, claimEndDate));
  const futureBaseMinutes = Math.round(
    baseMinutes * Math.min(1, futureDays / claimWindowDays),
  );
  const dueMinutes = Math.min(
    totalMinutes,
    Math.max(0, baseMinutes - futureBaseMinutes) + extraMinutes,
  );
  const paceGapMinutes = Math.max(0, dueMinutes - completedMinutes);
  const foodRatio = remainingMinutes === 0
    ? 1
    : dueMinutes === 0
      ? completedMinutes > 0 ? 1 : 0
      : Math.max(0, Math.min(1, completedMinutes / dueMinutes));

  if (foodRatio >= 0.9) {
    return {
      foodRatio,
      bowlLevel: "full",
      bowlLabel: "很满",
      emotion: "happy",
      emotionLabel: "高兴",
      statusText: paceGapMinutes === 0 ? "今天的进度很棒，它们吃饱啦" : "进度充足，它们很满足",
      futureBaseMinutes,
      paceGapMinutes,
    };
  }
  if (foodRatio >= 0.42) {
    return {
      foodRatio,
      bowlLevel: "normal",
      bowlLabel: "一般",
      emotion: "neutral",
      emotionLabel: "一般",
      statusText: "完成今天的任务，食盆就会变满",
      futureBaseMinutes,
      paceGapMinutes,
    };
  }
  if (foodRatio > 0.05) {
    return {
      foodRatio,
      bowlLevel: "low",
      bowlLabel: "偏少",
      emotion: "unhappy",
      emotionLabel: "不高兴",
      statusText: "进度有点落后，它们在等你运动",
      futureBaseMinutes,
      paceGapMinutes,
    };
  }
  return {
    foodRatio: 0,
    bowlLevel: "empty",
    bowlLabel: "没有",
    emotion: "pitiful",
    emotionLabel: "可可怜怜",
    statusText: "食盆空了，今天动一动吧",
    futureBaseMinutes,
    paceGapMinutes,
  };
}

function monthTotals(month) {
  const baseTaskMinutes = Number(month?.base_task_minutes || 0);
  const extraTaskMinutes = Number(month?.extra_task_minutes || 0);
  const storedCompletedMinutes = Number(month?.completed_minutes || 0);
  const baseCompletedMinutes = Number(
    month?.base_completed_minutes
      ?? Math.min(baseTaskMinutes, storedCompletedMinutes),
  );
  const extraCompletedMinutes = Number(
    month?.extra_completed_minutes
      ?? Math.max(0, storedCompletedMinutes - baseCompletedMinutes),
  );
  const completedMinutes = baseCompletedMinutes + extraCompletedMinutes;
  return {
    baseTaskMinutes,
    extraTaskMinutes,
    baseCompletedMinutes,
    extraCompletedMinutes,
    completedMinutes,
    totalMinutes: baseTaskMinutes + extraTaskMinutes,
    remainingMinutes: baseTaskMinutes + extraTaskMinutes - completedMinutes,
  };
}

export function calculateBaseDueMinutes(month, today) {
  const baseMinutes = Number(month?.base_task_minutes || 0);
  if (baseMinutes === 0 || !month?.claim_date) return 0;
  const claimDate = month.claim_date;
  const claimEndDate = month.claim_end_date || claimDate;
  if (today < claimDate) return 0;
  if (today >= claimEndDate) return baseMinutes;
  const claimWindowDays = Math.max(1, daysBetween(claimDate, claimEndDate) + 1);
  const futureDays = Math.max(0, daysBetween(today, claimEndDate));
  return Math.max(
    0,
    baseMinutes - Math.round(baseMinutes * Math.min(1, futureDays / claimWindowDays)),
  );
}

export function calculatePendingBreakdown({
  baseTaskMinutes,
  extraTaskMinutes,
  baseCompletedMinutes,
  extraCompletedMinutes,
  futureBaseMinutes,
  creditMinutes = 0,
}) {
  const baseDueThroughToday = Math.max(0, baseTaskMinutes - futureBaseMinutes);
  const basePending = Math.max(0, baseDueThroughToday - baseCompletedMinutes);
  const creditAfterBase = Math.max(0, creditMinutes - basePending);
  return {
    pendingMinutes: Math.max(0, basePending - creditMinutes),
    extraPendingMinutes: Math.max(
      0,
      extraTaskMinutes - extraCompletedMinutes - creditAfterBase,
    ),
  };
}

export function calculateExerciseRollup({
  months = [],
  creditMinutes = 0,
  today,
}) {
  const totals = months.reduce((result, month) => {
    const item = monthTotals(month);
    const baseDueMinutes = calculateBaseDueMinutes(month, today);
    result.baseTaskMinutes += item.baseTaskMinutes;
    result.extraTaskMinutes += item.extraTaskMinutes;
    result.baseCompletedMinutes += item.baseCompletedMinutes;
    result.extraCompletedMinutes += item.extraCompletedMinutes;
    result.completedMinutes += item.completedMinutes;
    result.basePendingMinutes += Math.max(
      0,
      baseDueMinutes - item.baseCompletedMinutes,
    );
    result.extraPendingMinutes += Math.max(
      0,
      item.extraTaskMinutes - item.extraCompletedMinutes,
    );
    result.dueMinutes += baseDueMinutes + item.extraTaskMinutes;
    return result;
  }, {
    baseTaskMinutes: 0,
    extraTaskMinutes: 0,
    baseCompletedMinutes: 0,
    extraCompletedMinutes: 0,
    completedMinutes: 0,
    basePendingMinutes: 0,
    extraPendingMinutes: 0,
    dueMinutes: 0,
  });
  const totalMinutes = totals.baseTaskMinutes + totals.extraTaskMinutes;
  const creditAfterBase = Math.max(0, creditMinutes - totals.basePendingMinutes);
  const pendingMinutes = Math.max(0, totals.basePendingMinutes - creditMinutes);
  const extraPendingMinutes = Math.max(
    0,
    totals.extraPendingMinutes - creditAfterBase,
  );
  const effectiveCompletedMinutes = totals.completedMinutes + creditMinutes;
  const foodRatio = totals.dueMinutes === 0
    ? effectiveCompletedMinutes > 0 ? 1 : 0
    : Math.max(0, Math.min(1, effectiveCompletedMinutes / totals.dueMinutes));

  let bowlLevel = "empty";
  let bowlLabel = "没有";
  let emotion = "pitiful";
  let emotionLabel = "可可怜怜";
  let statusText = totalMinutes === 0
    ? "领取任务后，它们会等你投喂"
    : "食盆空了，今天动一动吧";
  if (foodRatio >= 0.9) {
    bowlLevel = "full";
    bowlLabel = "很满";
    emotion = "happy";
    emotionLabel = "高兴";
    statusText = "今天的进度很棒，它们吃饱啦";
  } else if (foodRatio >= 0.42) {
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
    statusText = "进度有点落后，它们在等你运动";
  }

  return {
    ...totals,
    totalMinutes,
    creditMinutes,
    remainingMinutes: totalMinutes - totals.completedMinutes - creditMinutes,
    pendingMinutes,
    extraPendingMinutes,
    foodRatio,
    bowlLevel,
    bowlLabel,
    emotion,
    emotionLabel,
    statusText,
    paceGapMinutes: pendingMinutes + extraPendingMinutes,
  };
}

export async function getExerciseDashboard(supabase, userId, now = new Date()) {
  const context = monthContext(now);
  const [profileResult, monthsResult] = await Promise.all([
    supabase
      .from("exercise_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("exercise_months")
      .select("*")
      .eq("user_id", userId)
      .order("month_start", { ascending: true }),
  ]);
  throwSupabaseError(profileResult.error, "读取运动设置失败。");
  throwSupabaseError(monthsResult.error, "读取运动任务失败。");

  const profile = {
    daily_minutes: Number(profileResult.data?.daily_minutes || DEFAULT_DAILY_MINUTES),
    monthly_rest_days: Number(
      profileResult.data?.monthly_rest_days ?? DEFAULT_MONTHLY_REST_DAYS,
    ),
    credit_minutes: Number(profileResult.data?.credit_minutes || 0),
  };
  const claimPreview = calculateMonthlyClaim({
    dailyMinutes: profile.daily_minutes,
    monthlyRestDays: profile.monthly_rest_days,
    now,
  });
  const months = monthsResult.data || [];
  const month = months.find((item) => item.month_start === context.monthStart);
  const rollup = calculateExerciseRollup({
    months,
    creditMinutes: profile.credit_minutes,
    today: context.today,
  });

  return {
    profile,
    month: {
      month_start: context.monthStart,
      claimed: Boolean(month?.claimed_at),
      claimed_at: month?.claimed_at || null,
      baseTaskMinutes: rollup.baseTaskMinutes,
      extraTaskMinutes: rollup.extraTaskMinutes,
      baseCompletedMinutes: rollup.baseCompletedMinutes,
      extraCompletedMinutes: rollup.extraCompletedMinutes,
      completedMinutes: rollup.completedMinutes,
      totalMinutes: rollup.totalMinutes,
      remainingMinutes: rollup.remainingMinutes,
    },
    today: {
      date: context.today,
      completed: rollup.pendingMinutes === 0,
      pending_minutes: rollup.pendingMinutes,
      extra_pending_minutes: rollup.extraPendingMinutes,
    },
    claim_preview: {
      minutes: claimPreview.taskMinutes,
      calendar_days: claimPreview.remainingDays,
      exercise_days: claimPreview.plannedExerciseDays,
      rest_days: claimPreview.proratedRestDays,
    },
    cat: {
      food_ratio: Number(rollup.foodRatio.toFixed(3)),
      bowl_level: rollup.bowlLevel,
      bowl_label: rollup.bowlLabel,
      emotion: rollup.emotion,
      emotion_label: rollup.emotionLabel,
      status_text: rollup.statusText,
      pace_gap_minutes: rollup.paceGapMinutes,
    },
  };
}

export async function saveExerciseSettings(supabase, userId, body, now = new Date()) {
  const dailyMinutes = integerValue(body.daily_minutes, "每日运动分钟数", 1, 300);
  const monthlyRestDays = integerValue(body.monthly_rest_days, "每月休息天数", 0, 28);
  const { error } = await supabase.rpc("save_exercise_profile", {
    p_user_id: userId,
    p_daily_minutes: dailyMinutes,
    p_monthly_rest_days: monthlyRestDays,
  });
  throwSupabaseError(error, "保存运动设置失败。");
  return getExerciseDashboard(supabase, userId, now);
}

export async function resetExerciseState(supabase, userId, now = new Date()) {
  const { error } = await supabase.rpc("reset_exercise_state", {
    p_user_id: userId,
  });
  throwSupabaseError(error, "重置运动状态失败。");
  return getExerciseDashboard(supabase, userId, now);
}

export async function claimExerciseMonth(supabase, userId, now = new Date()) {
  const dashboard = await getExerciseDashboard(supabase, userId, now);
  const claim = calculateMonthlyClaim({
    dailyMinutes: dashboard.profile.daily_minutes,
    monthlyRestDays: dashboard.profile.monthly_rest_days,
    now,
  });
  const { error } = await supabase.rpc("claim_exercise_month", {
    p_user_id: userId,
    p_month_start: claim.monthStart,
    p_claim_date: claim.today,
    p_claim_end_date: claim.monthEnd,
    p_base_task_minutes: claim.taskMinutes,
  });
  throwSupabaseError(error, "领取本月任务失败。", {
    P0001: {
      statusCode: 409,
      code: "EXERCISE_MONTH_ALREADY_CLAIMED",
      message: "本月任务已经领取过了。",
    },
  });
  return getExerciseDashboard(supabase, userId, now);
}

export async function addExerciseTask(supabase, userId, body, now = new Date()) {
  const minutes = integerValue(body.minutes, "加餐任务分钟数", 1, 10_000);
  const context = monthContext(now);
  const { error } = await supabase.rpc("add_exercise_task", {
    p_user_id: userId,
    p_month_start: context.monthStart,
    p_claim_end_date: context.monthEnd,
    p_minutes: minutes,
  });
  throwSupabaseError(error, "领取加餐任务失败。");
  return getExerciseDashboard(supabase, userId, now);
}

export async function completeExerciseTasks(supabase, userId, body, now = new Date()) {
  const minutes = integerValue(body.minutes, "完成分钟数", 1, 10_000);
  const context = monthContext(now);
  const { error } = await supabase.rpc("complete_exercise_tasks", {
    p_user_id: userId,
    p_completion_date: context.today,
    p_minutes: minutes,
  });
  throwSupabaseError(error, "记录完成任务失败。");
  return getExerciseDashboard(supabase, userId, now);
}
