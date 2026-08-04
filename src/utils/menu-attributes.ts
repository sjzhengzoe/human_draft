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
  const matched = new Set<string>()
  const unknown: string[] = []

  splitAttributeValues(values).forEach((value) => {
    let hasMatch = false
    if (/[煎炒爆煸]/.test(value)) {
      matched.add("煎炒")
      hasMatch = true
    }
    if (/[蒸煮炖焖煲汤卤]/.test(value) || /红烧|烧制/.test(value) || value === "烧") {
      matched.add("蒸煮")
      hasMatch = true
    }
    if (/[凉拌腌]/.test(value)) {
      matched.add("凉拌")
      hasMatch = true
    }
    if (/[烤炸]/.test(value) || /空气炸锅/.test(value)) {
      matched.add("烤炸")
      hasMatch = true
    }
    if (!hasMatch && !unknown.includes(value)) unknown.push(value)
  })

  return [
    ...COOKING_TYPE_OPTIONS.filter((value) => matched.has(value)),
    ...unknown
  ]
}

export function normalizeTasteTags(value: string): string[] {
  const selected = new Set(
    splitAttributeValues([value]).filter((item) =>
      TASTE_OPTIONS.includes(item)
    )
  )
  return TASTE_OPTIONS.filter((item) => selected.has(item))
}
