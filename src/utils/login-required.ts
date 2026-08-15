import { getCurrentUser } from "../services/auth"

type LoginDialogHost = {
  selectComponent(selector: string): WechatMiniprogram.Component.TrivialInstance | null
}

export function requireLoginForAction(host: LoginDialogHost): boolean {
  if (getCurrentUser()) return true
  const dialog = host.selectComponent("#login-required-dialog") as (
    WechatMiniprogram.Component.TrivialInstance & { open?: () => void }
  ) | null
  dialog?.open?.()
  return false
}
