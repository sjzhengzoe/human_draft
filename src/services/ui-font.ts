import { UI_FONT } from "../config/ui-font"
import { loadAppFont } from "./font-loader"

export function initializeUIFont(): Promise<void> {
  return loadAppFont(UI_FONT)
}
