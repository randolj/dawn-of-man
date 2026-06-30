import type { Building, NpcVillage, PathSegment, Resources, Vec2, Villager } from './types'

// Local-only persistence (no backend). Bump SAVE_VERSION on any breaking change
// to the shapes below — older saves are then ignored rather than mis-loaded.
const SAVE_KEY = 'village-maker-save-v1'
export const SAVE_VERSION = 5

/** the persisted slice of game state (everything else is transient or derived) */
export interface SaveData {
  version: number
  resources: Resources
  tierIndex: number
  villagers: Villager[]
  buildings: Building[]
  paths: PathSegment[]
  npcVillages: NpcVillage[]
  /** fog-of-war breadcrumbs the player has explored */
  explored: Vec2[]
  objectiveStep: number
  firstWoodDelivered: boolean
  firstFoodDelivered: boolean
}

export function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as SaveData
    if (!data || data.version !== SAVE_VERSION || !Array.isArray(data.villagers)) return null
    return data
  } catch {
    return null
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    /* storage unavailable / full — silently skip */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}
