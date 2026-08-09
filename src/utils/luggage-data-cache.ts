import type { LuggageScene } from "../types/luggage"

let cachedLuggageScenes: LuggageScene[] | null = null
let luggageDataRevision = 0

function cloneLuggageScene(scene: LuggageScene): LuggageScene {
  return {
    ...scene,
    groups: scene.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item }))
    }))
  }
}

function cloneLuggageScenes(scenes: LuggageScene[]): LuggageScene[] {
  return scenes.map(cloneLuggageScene)
}

export function getLuggageDataRevision(): number {
  return luggageDataRevision
}

export function hasCachedLuggageScenes(): boolean {
  return cachedLuggageScenes !== null
}

export function getCachedLuggageScenes(): LuggageScene[] | null {
  return cachedLuggageScenes ? cloneLuggageScenes(cachedLuggageScenes) : null
}

export function cacheLuggageScenes(scenes: LuggageScene[]): void {
  cachedLuggageScenes = cloneLuggageScenes(scenes)
}

export function replaceLuggageDataCache(scenes: LuggageScene[]): number {
  cachedLuggageScenes = cloneLuggageScenes(scenes)
  luggageDataRevision += 1
  return luggageDataRevision
}

export function updateLuggageDataCache(
  updater: (scenes: LuggageScene[]) => LuggageScene[]
): number {
  if (cachedLuggageScenes) {
    cachedLuggageScenes = cloneLuggageScenes(updater(cloneLuggageScenes(cachedLuggageScenes)))
  }
  luggageDataRevision += 1
  return luggageDataRevision
}

export function clearLuggageDataCache(): void {
  cachedLuggageScenes = null
  luggageDataRevision += 1
}
