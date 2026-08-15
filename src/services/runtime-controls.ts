import type {
  RuntimeControlAdminState,
  RuntimeControlKey
} from "../types/api"
import { request } from "./request"

export function getRuntimeControlAdminState(): Promise<RuntimeControlAdminState> {
  return request<RuntimeControlAdminState>({
    path: "/api/admin/runtime-controls"
  })
}

export async function updateRuntimeControl(
  key: RuntimeControlKey,
  enabled: boolean,
  reason: string
): Promise<void> {
  await request<{ controls: RuntimeControlAdminState["controls"] }>({
    path: `/api/admin/runtime-controls/${key}`,
    method: "PUT",
    data: { enabled, reason }
  })
}
