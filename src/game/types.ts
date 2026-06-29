export type ResourceType = 'wood' | 'food'

export type Resources = Record<ResourceType, number>

export interface Vec2 {
  x: number
  z: number
}

export type VillagerState =
  | 'idle' // unemployed; wanders around the townhall
  | 'toWork' // walking out to their assigned workplace
  | 'working' // at the workplace, producing a load
  | 'hauling' // carrying a produced load back to the townhall
  | 'waiting' // employed but their resource is full; loiters near the townhall
  | 'held' // picked up by the god's hand; position driven by the cursor

export interface Villager {
  id: number
  pos: Vec2
  /** logical facing, used for a little bit of life in the animation */
  heading: number
  state: VillagerState
  /** production building this villager is employed at, or null if idle */
  workplaceId: number | null
  carry: number
  carryType: ResourceType | null
  /** resource field this villager is gathering by hand (no building), or null */
  forageFieldId: number | null
  /** current loiter target while idle/waiting (near the townhall), or null */
  wanderTarget: Vec2 | null
  /** counts up while producing a load (also reused as the idle pause timer) */
  workTimer: number
  /** waypoints for the current trip (follows roads when one connects), or null */
  route: Vec2[] | null
  routeIndex: number
  /** purely cosmetic phase offset so villagers don't bob in sync */
  bob: number
}

// ---- natural resource areas -------------------------------------------------
export type FieldType = 'forest' | 'berryfield'

export interface ResourceField {
  id: number
  type: FieldType
  pos: Vec2
  radius: number
}

// ---- player-built things ----------------------------------------------------
export type BuildMode = 'none' | 'house' | 'path' | 'lumberyard' | 'forager'

export type BuildingKind = 'house' | 'lumberyard' | 'forager'

/** which dwelling model a residence shows, by era */
export type ResidenceModelKind = 'leanto' | 'tent' | 'hut' | 'house' | 'cottage'

export interface Building {
  id: number
  kind: BuildingKind
  pos: Vec2
  rot: number
  /** era level of this residence (index into RESIDENCE_ERAS); houses only */
  level: number
  /** villager ids employed here (production buildings only) */
  workers: number[]
}

/** per-era residence definition (model, capacity, costs) */
export interface ResidenceEra {
  name: string
  model: ResidenceModelKind
  popBonus: number
  buildCost: Resources
  /** cost to upgrade an existing residence FROM the previous era to this one (null for era 0) */
  upgradeCost: Resources | null
}

/** one upgrade level of a production building (gated by town tier) */
export interface ProductionLevel {
  /** display name at this level (e.g. Sawmill -> Lumber Mill) */
  name: string
  /** how many workers it can employ */
  slots: number
  /** units one worker carries per haul */
  load: number
  /** seconds a worker spends producing one load */
  workTime: number
  /** town tier required to reach this level */
  reqTier: number
  /** cost to upgrade INTO this level (null for the base level 0) */
  upgradeCost: Resources | null
}

/** static definition of a production building type */
export interface ProductionDef {
  kind: 'lumberyard' | 'forager'
  /** what it yields into your inventory */
  produces: ResourceType
  /** which natural field it must be built on */
  fieldType: FieldType
  /** cost to first place it (always at level 0) */
  cost: Resources
  half: number
  /** progression of levels; index lines up with Building.level */
  levels: ProductionLevel[]
}

export interface PathSegment {
  id: number
  a: Vec2
  b: Vec2
  /** 0 = dirt path; higher levels are future road upgrades */
  level: number
}

/** transient feedback message */
export interface Toast {
  id: number
  msg: string
  kind: 'info' | 'good' | 'warn'
}

export interface TownTier {
  /** building name at this tier */
  name: string
  /** flavour era label */
  era: string
  /** how many villagers this tier can support */
  popCap: number
  /** max amount of EACH resource you can stockpile at this tier */
  storageCap: number
  /** radius of your claimed territory at this tier (you can only build inside it) */
  territoryRadius: number
  /** cost paid to REACH this tier (undefined for the starting tier) */
  upgradeCost?: Resources
  /** visual */
  color: string
  height: number
}

/** what the player currently has selected for the management panel */
export type Selection = { kind: 'building'; id: number } | { kind: 'townhall' } | null
