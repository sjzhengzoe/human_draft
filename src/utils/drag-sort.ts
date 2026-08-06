export type SortableRect = {
  left: number
  right: number
  top: number
  bottom: number
}

export function hasSameOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export function findClosestSortTarget(
  rects: SortableRect[],
  clientX: number,
  clientY: number
): number {
  const containingIndex = rects.findIndex(
    (rect) =>
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
  )
  if (containingIndex >= 0) return containingIndex

  let closestIndex = -1
  let closestDistance = Number.POSITIVE_INFINITY
  rects.forEach((rect, index) => {
    const centerX = (rect.left + rect.right) / 2
    const centerY = (rect.top + rect.bottom) / 2
    const distance = (centerX - clientX) ** 2 + (centerY - clientY) ** 2
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  })
  return closestIndex
}
