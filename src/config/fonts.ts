export type AppFontDefinition = {
  family: string
  name: string
  source: string
  weight: "normal" | "600"
}

const FONT_ASSET_ORIGIN = "https://gufeifei.cn"

export const APP_FONTS = {
  ui: {
    family: "HumanDraftUI",
    name: "方正博雅仿刊宋",
    source: `url("${FONT_ASSET_ORIGIN}/fonts/fangzhengboyafangkansong.woff2?v=20260731-ui")`,
    weight: "normal"
  },
  red3: {
    family: "Red3GB2312",
    name: "红三",
    source: `url("${FONT_ASSET_ORIGIN}/fonts/red3-gb2312.woff2?v=20260705")`,
    weight: "normal"
  },
  lantingExtraLight: {
    family: "FangzhengLantingheiExtralight",
    name: "方正兰亭黑 ExtraLight",
    source: `url("${FONT_ASSET_ORIGIN}/fonts/FZLTHProGlobal-Extralight.woff2?v=20260802")`,
    weight: "normal"
  },
  lantingSemibold: {
    family: "MenuMetaText",
    name: "方正兰亭黑 Semibold",
    source: `url("${FONT_ASSET_ORIGIN}/fonts/FZLTHProGlobal-Semibold.woff2?v=20260705")`,
    weight: "600"
  }
} as const satisfies Record<string, AppFontDefinition>
