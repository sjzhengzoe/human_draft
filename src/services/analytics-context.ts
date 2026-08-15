export type ProductAttribution = {
  source_scene?: number
  source_campaign?: string
  source_referrer_app_id?: string
  release_channel?: "develop" | "trial" | "release"
}

let currentAttribution: ProductAttribution = {}

function safeCode(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().slice(0, maxLength)
  return /^[A-Za-z0-9_-]+$/.test(normalized) ? normalized : undefined
}

function getReleaseChannel(): ProductAttribution["release_channel"] {
  try {
    const channel = wx.getAccountInfoSync().miniProgram.envVersion
    return channel === "develop" || channel === "trial" || channel === "release"
      ? channel
      : undefined
  } catch (_error) {
    return undefined
  }
}

export function captureProductAttribution(
  options?: WechatMiniprogram.App.LaunchShowOption
): void {
  const numericScene = Number(options?.scene)
  const query = options?.query || {}
  const sourceCampaign = safeCode(
    query.campaign || query.utm_campaign || query.source,
    64
  )
  const referrerAppId = safeCode(options?.referrerInfo?.appId, 64)
  const releaseChannel = getReleaseChannel()
  currentAttribution = {
    ...(Number.isInteger(numericScene) && numericScene >= 0 && numericScene <= 99999
      ? { source_scene: numericScene }
      : {}),
    ...(sourceCampaign ? { source_campaign: sourceCampaign } : {}),
    ...(referrerAppId ? { source_referrer_app_id: referrerAppId } : {}),
    ...(releaseChannel ? { release_channel: releaseChannel } : {})
  }
}

export function getProductAttribution(): ProductAttribution {
  return { ...currentAttribution }
}
