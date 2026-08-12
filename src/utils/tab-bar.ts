type AppTabBarState = Partial<{
  selected: number
  hidden: boolean
  masked: boolean
}>

export function updateAppTabBarState(
  tabBar: WechatMiniprogram.Component.TrivialInstance | undefined,
  nextState: AppTabBarState
) {
  if (!tabBar) return

  const updates: WechatMiniprogram.IAnyObject = {}
  if (nextState.selected !== undefined && nextState.selected !== tabBar.data.selected) {
    updates.selected = nextState.selected
  }
  if (nextState.hidden !== undefined && nextState.hidden !== tabBar.data.hidden) {
    updates.hidden = nextState.hidden
  }
  if (nextState.masked !== undefined && nextState.masked !== tabBar.data.masked) {
    updates.masked = nextState.masked
  }
  if (Object.keys(updates).length > 0) tabBar.setData(updates)
}
