export const UI_COLORS = {
  surface: "#ffffff",
  pageBackground: "#f5f5f5",
  textPrimary: "#111111",
  textMuted: "#777772",
  actionPrimary: "#111111",
  danger: "#c9342f",
  overlaySoft: "rgba(0, 0, 0, 0.18)"
} as const

export const FOOTPRINT_COLORS = {
  mapFill: "#e5e6df",
  cityFill: "#d7d8d4",
  visitedFill: "#189d4c",
  visitedGlow: "rgba(31, 216, 101, 0.58)",
  border: UI_COLORS.surface,
  mutedText: UI_COLORS.textMuted,
  visitedText: UI_COLORS.surface,
  labelHalo: UI_COLORS.surface,
  selectedFill: UI_COLORS.actionPrimary,
  selectedCityOverlay: "rgba(17, 17, 17, 0.28)",
  selectedGlow: "rgba(17, 17, 17, 0.32)"
} as const

export const MENU_PRINT_COLORS = {
  overlay: "rgba(48, 39, 32, 0.5)",
  ink: "#302720",
  mutedInk: "rgba(48, 39, 32, 0.46)",
  border: "rgba(48, 39, 32, 0.18)",
  paper: UI_COLORS.surface
} as const

export const TEXT_CARD_RENDER_COLORS = {
  texture: "rgba(255, 251, 240, 0.26)",
  ink: "#1a1a1a",
  black: "#000000"
} as const
