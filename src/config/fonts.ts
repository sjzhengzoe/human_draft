export type AppFontDefinition = {
  family: string
  name: string
  url: string
  source: string
  weight: "normal" | "600"
  persistentCache?: {
    fileName: string
    version: string
  }
}

const FONT_ASSET_ORIGIN = "https://gufeifei.cn"
const UI_FONT_URL = `${FONT_ASSET_ORIGIN}/fonts/fangzhengboyafangkansong.woff2?v=20260731-ui`
const RED3_FONT_URL = `${FONT_ASSET_ORIGIN}/fonts/red3-gb2312.woff2?v=20260705`
const LANTING_EXTRA_LIGHT_URL = `${FONT_ASSET_ORIGIN}/fonts/FZLTHProGlobal-Extralight.woff2?v=20260802`
const LANTING_SEMIBOLD_URL = `${FONT_ASSET_ORIGIN}/fonts/FZLTHProGlobal-Semibold.woff2?v=20260705`

export const APP_FONTS = {
  ui: {
    family: "HumanDraftUI",
    name: "方正博雅仿刊宋",
    url: UI_FONT_URL,
    source: `url("${UI_FONT_URL}")`,
    weight: "normal"
  },
  red3: {
    family: "Red3GB2312",
    name: "红三",
    url: RED3_FONT_URL,
    source: `url("${RED3_FONT_URL}")`,
    weight: "normal",
    persistentCache: {
      fileName: "red3-gb2312.woff2",
      version: "20260705"
    }
  },
  lantingExtraLight: {
    family: "FangzhengLantingheiExtralight",
    name: "方正兰亭黑 ExtraLight",
    url: LANTING_EXTRA_LIGHT_URL,
    source: `url("${LANTING_EXTRA_LIGHT_URL}")`,
    weight: "normal"
  },
  lantingSemibold: {
    family: "MenuMetaText",
    name: "方正兰亭黑 Semibold",
    url: LANTING_SEMIBOLD_URL,
    source: `url("${LANTING_SEMIBOLD_URL}")`,
    weight: "600"
  }
} as const satisfies Record<string, AppFontDefinition>
