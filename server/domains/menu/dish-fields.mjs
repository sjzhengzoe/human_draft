import { assertCondition } from "../../lib/errors.mjs";

export const COOKING_METHOD_OPTIONS = [
  { code: "cooking_01", label: "煎炒" },
  { code: "cooking_02", label: "蒸煮" },
  { code: "cooking_03", label: "凉拌" },
  { code: "cooking_04", label: "烤炸" },
  { code: "cooking_05", label: "即食" },
];
export const TASTE_OPTIONS = [
  { code: "taste_01", label: "清淡" },
  { code: "taste_02", label: "咸" },
  { code: "taste_03", label: "鲜" },
  { code: "taste_04", label: "香" },
  { code: "taste_05", label: "酸" },
  { code: "taste_06", label: "甜" },
  { code: "taste_07", label: "辣" },
];
export const DEFAULT_MEAL_PERIODS = ["lunch", "dinner"];
const ALLOWED_MEAL_PERIODS = new Set(["breakfast", "lunch", "afternoon_tea", "dinner"]);
export const ALLOWED_RECORD_TYPES = new Set(["home", "outside"]);

export function normalizeMealPeriods(value, useDefault = false) {
  let periods = value;

  if (typeof periods === "string") {
    try {
      periods = JSON.parse(periods);
    } catch (_error) {
      periods = periods.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }

  if (periods === undefined && useDefault) return [...DEFAULT_MEAL_PERIODS];

  assertCondition(
    Array.isArray(periods)
      && periods.length >= 1
      && periods.length <= ALLOWED_MEAL_PERIODS.size
      && periods.every((period) => typeof period === "string" && ALLOWED_MEAL_PERIODS.has(period))
      && new Set(periods).size === periods.length,
    400,
    "INVALID_MEAL_PERIODS",
    "请至少选择一个有效餐次。",
  );
  return periods;
}

export function normalizeRecordType(value, useDefault = false) {
  const recordType = typeof value === "string" ? value.trim() : value;
  if ((recordType === undefined || recordType === "") && useDefault) return "home";
  assertCondition(
    typeof recordType === "string" && ALLOWED_RECORD_TYPES.has(recordType),
    400,
    "INVALID_RECORD_TYPE",
    "请选择在家或外食。",
  );
  return recordType;
}

function normalizeTextItems(
  value,
  {
    useDefault = false,
    maxItems,
    maxItemLength,
    code,
    message,
  },
) {
  let items = value;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch (_error) {
      items = items.split(/[\n，,、]/);
    }
  }
  if (items === undefined && useDefault) return [];
  assertCondition(
    Array.isArray(items)
      && items.length <= maxItems
      && items.every(
        (item) => typeof item === "string" && item.trim().length <= maxItemLength,
      ),
    400,
    code,
    message,
  );
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function normalizeOptionalText(value, { useDefault = false, maxLength, code, message }) {
  if (value === undefined && useDefault) return "";
  assertCondition(typeof value === "string", 400, code, message);
  const text = value.trim();
  assertCondition(text.length <= maxLength, 400, code, message);
  return text;
}

export function normalizeMainIngredients(value, useDefault = false) {
  return normalizeTextItems(value, {
    useDefault,
    maxItems: 30,
    maxItemLength: 80,
    code: "INVALID_MAIN_INGREDIENTS",
    message: "主要食材格式无效。",
  });
}

export function normalizeCookingMethods(value, useDefault = false) {
  const labels = normalizeTextItems(value, {
    useDefault,
    maxItems: COOKING_METHOD_OPTIONS.length,
    maxItemLength: 80,
    code: "INVALID_COOKING_METHODS",
    message: "烹饪方式格式无效。",
  });
  const selected = new Set(labels);
  assertCondition(
    labels.every((label) => COOKING_METHOD_OPTIONS.some((option) => option.label === label)),
    400,
    "INVALID_COOKING_METHODS",
    "请选择有效的烹饪类型。",
  );
  return COOKING_METHOD_OPTIONS
    .filter((option) => selected.has(option.label))
    .map((option) => option.code);
}

export function normalizeFlavorOptions(value, useDefault = false) {
  return normalizeTextItems(value, {
    useDefault,
    maxItems: 30,
    maxItemLength: 80,
    code: "INVALID_FLAVOR_OPTIONS",
    message: "衍生菜系格式无效。",
  });
}

export function normalizeIntroduction(value, useDefault = false) {
  return normalizeOptionalText(value, {
    useDefault,
    maxLength: 1000,
    code: "INVALID_INTRODUCTION",
    message: "介绍不能超过 1000 个字符。",
  });
}

export function normalizeTaste(value, useDefault = false) {
  const taste = normalizeOptionalText(value, {
    useDefault,
    maxLength: 120,
    code: "INVALID_TASTE",
    message: "口味不能超过 120 个字符。",
  });
  if (!taste) return [];

  const tags = taste
    .split(/[\n，,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
  assertCondition(
    tags.length > 0
      && tags.length <= TASTE_OPTIONS.length
      && tags.every((tag) => TASTE_OPTIONS.some((option) => option.label === tag))
      && new Set(tags).size === tags.length,
    400,
    "INVALID_TASTE",
    "请选择有效的口味特点。",
  );
  const selected = new Set(tags);
  return TASTE_OPTIONS
    .filter((option) => selected.has(option.label))
    .map((option) => option.code);
}

export function enumLabels(codes, options) {
  if (!Array.isArray(codes)) return [];
  const selected = new Set(codes);
  return options
    .filter((option) => selected.has(option.code))
    .map((option) => option.label);
}
