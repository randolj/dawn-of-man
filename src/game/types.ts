export type ResourceType =
  | 'wood'
  | 'food'
  | 'stone'
  | 'mithril'
  | 'orichalcum'
  | 'starmetal'
  | 'weapons'

/** a full stockpile — every resource has a value */
export type Resources = Record<ResourceType, number>

/** a price — only the resources it actually costs need to be listed */
export type Cost = Partial<Resources>

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
  | 'scouting' // sent out to explore; reveals NPC villages it passes near
  | 'hunting' // a lodge worker chasing down a wild animal
  | 'marching' // a soldier in a war party heading to attack a village
  | 'fighting' // a soldier locked in melee at a village
  | 'converting' // a missionary at a village, winning it over
  | 'defending' // rallied to repel a raid on one of your settlements
  | 'settling' // a settler marching out to found a new settlement
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
  /** where a scout is currently headed (outbound target, then home), or null */
  scoutTarget: Vec2 | null
  /** true once a scout has reached its target and is heading back */
  scoutReturning: boolean
  /** the wild animal a hunter is currently chasing, or null */
  huntAnimalId: number | null
  /** the NPC village a soldier is marching on / a missionary is converting, or null */
  targetVillageId: number | null
  /** where a defender rallies to repel a raid (the clash point), or null */
  defendTarget: Vec2 | null
  /** purely cosmetic phase offset so villagers don't bob in sync */
  bob: number
}

// ---- wildlife ---------------------------------------------------------------
/** a roaming wild animal hunters can chase for meat (food) */
export interface Animal {
  id: number
  pos: Vec2
  heading: number
  /** spot it's ambling toward while grazing, or null */
  wanderTarget: Vec2 | null
  /** the loose home range it grazes within */
  home: Vec2
  /** pause timer between ambles */
  restTimer: number
  /** false once hunted; counts down `respawnTimer` then returns elsewhere */
  alive: boolean
  respawnTimer: number
  /** left-click hits taken from the first-person survivor (felled at DEER_HP) */
  hits: number
  bob: number
}

// ---- natural resource areas -------------------------------------------------
export type FieldType = 'forest' | 'berryfield' | 'rock' | 'mithrildeposit' | 'orichalcumdeposit'

export interface ResourceField {
  id: number
  type: FieldType
  pos: Vec2
  radius: number
}

// ---- player-built things ----------------------------------------------------
export type BuildMode =
  | 'none'
  | 'house'
  | 'path'
  | 'lumberyard'
  | 'forager'
  | 'quarry'
  | 'hunter'
  | 'mine'
  | 'orichalcummine'
  | 'smithy'
  | 'scout'
  | 'settle'
  | 'erasePath'

export type BuildingKind =
  | 'house'
  | 'lumberyard'
  | 'forager'
  | 'quarry'
  | 'hunter'
  | 'mine'
  | 'orichalcummine'
  | 'smithy'
  | 'starforge'

/** the production-building kinds (everything but residences) */
export type ProductionKind =
  | 'lumberyard'
  | 'forager'
  | 'quarry'
  | 'hunter'
  | 'mine'
  | 'orichalcummine'
  | 'smithy'
  | 'starforge'

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
  buildCost: Cost
  /** cost to upgrade an existing residence FROM the previous era to this one (null for era 0) */
  upgradeCost: Cost | null
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
  upgradeCost: Cost | null
}

/** static definition of a production building type */
export interface ProductionDef {
  kind: ProductionKind
  /** what it yields into your inventory */
  produces: ResourceType
  /** which natural field it must be built on, or null to place on open ground */
  fieldType: FieldType | null
  /** workers range out to chase wild animals instead of standing at the building */
  hunt?: boolean
  /** input resources drawn from your stockpile per load (crafting chains — dormant
   * for now; reused later for smelting/forging weapons & alloys) */
  consumes?: Cost
  /** cost to first place it (always at level 0) */
  cost: Cost
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
  /** max number of buildings you may have at this tier (advancing the age raises it) */
  buildCap: number
  /** radius of your claimed territory at this tier (you can only build inside it) */
  territoryRadius: number
  /** cost paid to REACH this tier (undefined for the starting tier) */
  upgradeCost?: Cost
  /** visual */
  color: string
  height: number
}

// ---- NPC villages (neutral settlements out in the world) --------------------
/** a lightweight wandering inhabitant of an NPC village (idle life + raiding) */
export interface NpcVillager {
  /** stable identity (render key + raid casualty tracking) */
  id: number
  pos: Vec2
  heading: number
  wanderTarget: Vec2 | null
  /** idle pause timer between ambles */
  restTimer: number
  /** a raid march target (clash point, then home), or null while at home */
  target: Vec2 | null
  /** cosmetic bob phase */
  bob: number
}

/** an in-progress melee at a village (drives the visible fight + casualties) */
export interface Battle {
  villageId: number
  /** seconds elapsed */
  timer: number
  /** does the attacker win? (decided up front from the two sides' strengths) */
  win: boolean
  /** soldiers fated to fall, each at a staggered moment during the fight */
  doomed: { id: number; at: number; dead: boolean }[]
}

/** an incoming attack from a neutral village on one of YOUR settlements */
export interface Raid {
  /** the attacking (neutral) village */
  fromVillageId: number
  /** centre of the settlement being defended */
  target: Vec2
  /** owned-village id under attack, or null when it's your capital */
  targetVillageId: number | null
  /** where the two sides meet — just outside the settlement, on the raiders' side */
  clash: Vec2
  phase: 'march' | 'fight'
  /** counts up once the melee begins */
  timer: number
  /** decided when the melee starts: do your defenders hold? */
  defenderWins: boolean
  /** NpcVillager ids marching in this raid */
  raiderIds: number[]
  /** raiders fated to fall, staggered through the fight */
  doomedRaiders: { id: number; at: number; dead: boolean }[]
  /** your defenders (player villager ids) fated to fall, staggered */
  doomedDefenders: { id: number; at: number; dead: boolean }[]
}

/** a neutral AI settlement: idles and slowly accrues its own resources */
export interface NpcVillage {
  id: number
  name: string
  /** has the player made contact (sent a scout that reached it)? */
  discovered: boolean
  /** neutral, or won over (conquered / converted) and now part of your realm */
  owner: 'neutral' | 'player'
  /** conversion progress 0..100 while a missionary preaches here */
  influence: number
  center: Vec2
  /** era / size, index into TOWN_TIERS */
  tierIndex: number
  territoryRadius: number
  /** their own stockpile, grows over time */
  resources: Resources
  /** resources gathered per second (their passive economy) */
  income: Resources
  /** decorative dwellings ringing the center */
  huts: { pos: Vec2; rot: number; model: ResidenceModelKind }[]
  villagers: NpcVillager[]
}

/** active when your capital has fallen: you control the lone survivor in first
 * person and must gather enough wood + food to found a new city */
export interface Refounding {
  woodGoal: number
  foodGoal: number
  /** the one villager you control (camera follows them) */
  survivorId: number
}

/** the endgame arc, kicked off when a meteor falls in the Medieval era */
export interface Endgame {
  /** where the meteor crashed (far from every settlement) */
  meteorPos: Vec2
  /** a scout has reached it */
  found: boolean
  /** the meteor has been opened (the Starforge is active) */
  open: boolean
  /** the chosen endgame path, set once starmetal is maxed */
  specialty: 'magic' | 'tech' | null
  /** the portal (magic) / starship (tech) has been built */
  built: boolean
  /** the people have passed through / launched — victory */
  won: boolean
}

/** what the player currently has selected for the management panel */
export type Selection =
  | { kind: 'building'; id: number }
  | { kind: 'townhall' }
  | { kind: 'npc'; id: number }
  | { kind: 'meteor' }
  | null
