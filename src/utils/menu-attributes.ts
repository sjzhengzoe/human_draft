export const COOKING_TYPE_OPTIONS = ["煎炒", "蒸煮", "凉拌", "烤炸"]
export const TASTE_OPTIONS = ["清淡", "咸", "鲜", "香", "酸", "甜", "辣"]

function splitAttributeValues(values: string[]): string[] {
  return values.flatMap((value) =>
    String(value || "")
      .split(/[\n，,、]/)
      .map((item) => item.trim())
      .filter(Boolean)
  )
}

export function normalizeCookingTypes(values: string[]): string[] {
  const selected = new Set(
    splitAttributeValues(values).filter((value) =>
      COOKING_TYPE_OPTIONS.includes(value)
    )
  )
  return COOKING_TYPE_OPTIONS.filter((value) => selected.has(value))
}

export function normalizeTasteTags(value: string): string[] {
  const selected = new Set(
    splitAttributeValues([value]).filter((item) =>
      TASTE_OPTIONS.includes(item)
    )
  )
  return TASTE_OPTIONS.filter((item) => selected.has(item))
}
