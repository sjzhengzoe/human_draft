export type SortableRect = {
  left: number
  right: number
  top: number
  bottom: number
}

type DragSortHost = {
  setData(data: Record<string, unknown>, callback?: () => void): void
}

type DragSortContext = Record<string, string | number | boolean>

type DragSortSession = {
  sourceKey: string
  sourceIndex: number
  targetIndex: number
  keys: string[]
  rect: SortableRect | null
  rects: SortableRect[]
  layoutRects: SortableRect[]
  touchOffsetX: number
  touchOffsetY: number
  lastTouchX: number
  lastTouchY: number
  axis: "vertical" | "horizontal" | "free"
  kind: string
  contextKey: string
  context: DragSortContext
}

export type DragSortStartOptions<T> = {
  items: T[]
  sourceIndex: number
  keyOf(item: T): string
  touch: WechatMiniprogram.TouchDetail
  selector: string
  layoutSelector?: string
  axis?: "vertical" | "horizontal" | "free"
  kind?: string
  contextKey?: string
  context?: DragSortContext
  title: string
  meta?: string
}

export type DragSortFinishResult<T> = {
  items: T[]
  context: DragSortContext
  kind: string
  contextKey: string
  sourceIndex: number
  targetIndex: number
}

const EMPTY_DRAG_SORT_PATCH = {
  draggingSortKey: "",
  dragSortKind: "",
  dragSortContextKey: "",
  dragSortPreviewStyles: [] as string[],
  dragSortGhostStyle: "",
  dragSortGhostTitle: "",
  dragSortGhostMeta: ""
}

export function createDragSortData() {
  return { ...EMPTY_DRAG_SORT_PATCH }
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

export function moveSortItemToIndex<T>(
  items: T[],
  sourceKey: string,
  targetIndex: number,
  keyOf: (item: T) => string
): T[] | null {
  const sourceIndex = items.findIndex((item) => keyOf(item) === sourceKey)
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= items.length || sourceIndex === targetIndex) return null
  const reordered = [...items]
  const [sourceItem] = reordered.splice(sourceIndex, 1)
  reordered.splice(targetIndex, 0, sourceItem)
  return reordered
}

export function dragSortPreviewStyles(
  rects: SortableRect[],
  sourceIndex: number,
  targetIndex: number
): string[] {
  const styles = rects.map(() => "")
  if (!rects[sourceIndex] || !rects[targetIndex] || sourceIndex === targetIndex) return styles

  const rangeStart = Math.min(sourceIndex, targetIndex)
  const rangeEnd = Math.max(sourceIndex, targetIndex)
  for (let index = rangeStart; index <= rangeEnd; index += 1) {
    if (index === sourceIndex) continue
    const destinationIndex = sourceIndex < targetIndex ? index - 1 : index + 1
    const sourceRect = rects[index]
    const destinationRect = rects[destinationIndex]
    if (!sourceRect || !destinationRect) continue
    const offsetX = destinationRect.left - sourceRect.left
    const offsetY = destinationRect.top - sourceRect.top
    styles[index] = `transform:translate(${offsetX}px,${offsetY}px);`
  }
  return styles
}

export function dragSortGhostStyle(
  touchX: number,
  touchY: number,
  touchOffsetX: number,
  touchOffsetY: number,
  rect: SortableRect,
  axis: "vertical" | "horizontal" | "free" = "vertical"
) {
  const left = axis === "vertical" ? rect.left : touchX - touchOffsetX
  const top = axis === "horizontal" ? rect.top : touchY - touchOffsetY
  return [
    `left:${left}px`,
    `top:${top}px`,
    `width:${rect.right - rect.left}px`,
    `height:${rect.bottom - rect.top}px`
  ].join(";")
}

export function createDragSortController() {
  let sequence = 0
  let session: DragSortSession | null = null

  function reset(host: DragSortHost) {
    sequence += 1
    session = null
    host.setData({ ...EMPTY_DRAG_SORT_PATCH })
  }

  function update(host: DragSortHost) {
    if (!session?.rect || session.rects.length === 0) return
    const targetIndex = findClosestSortTarget(session.rects, session.lastTouchX, session.lastTouchY)
    if (targetIndex < 0) return
    session.targetIndex = targetIndex
    host.setData({
      dragSortPreviewStyles: dragSortPreviewStyles(
        session.layoutRects,
        session.sourceIndex,
        targetIndex
      ),
      dragSortGhostStyle: dragSortGhostStyle(
        session.lastTouchX,
        session.lastTouchY,
        session.touchOffsetX,
        session.touchOffsetY,
        session.rect,
        session.axis
      )
    })
  }

  function start<T>(host: DragSortHost, options: DragSortStartOptions<T>) {
    const source = options.items[options.sourceIndex]
    if (!source || options.items.length < 2 || session) return false
    const keys = options.items.map(options.keyOf)
    const sourceKey = keys[options.sourceIndex]
    if (!sourceKey || new Set(keys).size !== keys.length) return false

    const currentSequence = ++sequence
    session = {
      sourceKey,
      sourceIndex: options.sourceIndex,
      targetIndex: options.sourceIndex,
      keys,
      rect: null,
      rects: [],
      layoutRects: [],
      touchOffsetX: 0,
      touchOffsetY: 0,
      lastTouchX: options.touch.clientX,
      lastTouchY: options.touch.clientY,
      axis: options.axis || "vertical",
      kind: options.kind || "list",
      contextKey: options.contextKey || "",
      context: options.context || {}
    }
    host.setData({
      draggingSortKey: sourceKey,
      dragSortKind: session.kind,
      dragSortContextKey: session.contextKey,
      dragSortPreviewStyles: [],
      dragSortGhostStyle: "",
      dragSortGhostTitle: options.title,
      dragSortGhostMeta: options.meta || ""
    })

    wx.nextTick(() => {
      const query = wx.createSelectorQuery().in(host as WechatMiniprogram.Component.TrivialInstance)
      query.selectAll(options.selector).boundingClientRect()
      query.selectAll(options.layoutSelector || options.selector).boundingClientRect()
      query.exec((results) => {
        if (currentSequence !== sequence || !session) return
        const rects = (results[0] || []) as SortableRect[]
        const layoutRects = (results[1] || []) as SortableRect[]
        const rect = rects[session.sourceIndex]
        if (!rect || rects.length !== session.keys.length || layoutRects.length !== rects.length) {
          reset(host)
          return
        }
        session.rect = rect
        session.rects = rects
        session.layoutRects = layoutRects
        session.touchOffsetX = session.lastTouchX - rect.left
        session.touchOffsetY = session.lastTouchY - rect.top
        update(host)
        wx.vibrateShort({ type: "light" })
      })
    })
    return true
  }

  function move(host: DragSortHost, event: WechatMiniprogram.TouchEvent) {
    if (!session) return
    const touch = event.touches[0] || event.changedTouches[0]
    if (!touch) return
    session.lastTouchX = touch.clientX
    session.lastTouchY = touch.clientY
    update(host)
  }

  function adjustForScroll(host: DragSortHost, deltaX: number, deltaY: number) {
    if (!session || (!deltaX && !deltaY)) return
    const adjust = (rect: SortableRect): SortableRect => ({
      left: rect.left - deltaX,
      right: rect.right - deltaX,
      top: rect.top - deltaY,
      bottom: rect.bottom - deltaY
    })
    if (session.rect) session.rect = adjust(session.rect)
    session.rects = session.rects.map(adjust)
    session.layoutRects = session.layoutRects.map(adjust)
    update(host)
  }

  function finish<T>(
    host: DragSortHost,
    items: T[],
    keyOf: (item: T) => string
  ): DragSortFinishResult<T> | null {
    const completed = session
    reset(host)
    if (!completed) return null
    const reordered = moveSortItemToIndex(items, completed.sourceKey, completed.targetIndex, keyOf)
    if (!reordered) return null
    return {
      items: reordered,
      context: completed.context,
      kind: completed.kind,
      contextKey: completed.contextKey,
      sourceIndex: completed.sourceIndex,
      targetIndex: completed.targetIndex
    }
  }

  function dispose() {
    sequence += 1
    session = null
  }

  return {
    start,
    move,
    finish,
    cancel: reset,
    dispose,
    adjustForScroll,
    isDragging: () => Boolean(session)
  }
}
