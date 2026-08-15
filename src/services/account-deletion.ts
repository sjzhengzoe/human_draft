import type { AccountDeletionResult } from "../types/api"
import { clearLocalAccountState, getWechatLoginCode } from "./auth"
import { request } from "./request"

export async function deleteCurrentAccount(): Promise<AccountDeletionResult> {
  const code = await getWechatLoginCode()
  const result = await request<AccountDeletionResult>({
    path: "/api/auth/account",
    method: "DELETE",
    data: {
      code,
      confirmation: "DELETE_MY_ACCOUNT"
    }
  })
  clearLocalAccountState()
  return result
}
