import type { ProductionDef, Resources, ResidenceEra, TownTier } from './types'

// ---- movement & logistics ---------------------------------------------------
export const WALK_SPEED = 2.0 // off-road speed (world units / second)
export const ROAD_SPEED = 4.2 // speed while travelling on a road
export const ROAD_INFLUENCE = 1.1 // how near a road counts as "on" it (~half path width + margin)
export const DEPOSIT_RADIUS = 2.0 // how close to the townhall counts as a delivery
export const WORK_STANDOFF = 1.3 // how far a worker stands from its building

// idle / waiting villagers loiter in this ring around the townhall, pausing briefly
export const WANDER_INNER = 2.8
export const WANDER_OUTER = 4.8
export const IDLE_PAUSE = 1.8 // seconds resting before ambling to a new spot

export const VILLAGER_COST: Resources = { wood: 0, food: 20 }

// ---- manual gathering (drag a villager onto a forest/berry field) -----------
// Deliberately worse than even a level-0 production building, so building one is
// always the upgrade. The field is infinite, so it's a slow "whenever" source.
export const MANUAL_LOAD = 3 // resource carried per trip
export const MANUAL_TIME = 4.0 // seconds per gather (slow)
export const MANUAL_STANDOFF = 0.65 // how far into the field (fraction of radius) a gatherer stands

// ---- player building --------------------------------------------------------
// Residences are themed and priced by era. A residence built now is created at
// the current town tier; older residences can be upgraded one era at a time
// (gaining capacity and a new model). Index lines up with TOWN_TIERS.
export const RESIDENCE_ERAS: ResidenceEra[] = [
  {
    name: 'Lean-to',
    model: 'leanto',
    popBonus: 2,
    buildCost: { wood: 20, food: 0 },
    upgradeCost: null,
  },
  {
    name: 'Tent',
    model: 'tent',
    popBonus: 3,
    buildCost: { wood: 30, food: 0 },
    upgradeCost: { wood: 25, food: 5 },
  },
  {
    name: 'Hut',
    model: 'hut',
    popBonus: 4,
    buildCost: { wood: 50, food: 10 },
    upgradeCost: { wood: 45, food: 15 },
  },
  {
    name: 'House',
    model: 'house',
    popBonus: 6,
    buildCost: { wood: 80, food: 25 },
    upgradeCost: { wood: 75, food: 30 },
  },
  {
    name: 'Cottage',
    model: 'cottage',
    popBonus: 8,
    buildCost: { wood: 120, food: 45 },
    upgradeCost: { wood: 120, food: 55 },
  },
]

export const RESIDENCE_HALF = 0.85 // half-footprint, used for placement spacing
export const PATH_WIDTH = 0.7

// ---- production buildings ---------------------------------------------------
// Placed on a matching natural field; each worker produces a load then hauls it
// to the townhall (faster along roads). Each building starts tiny (1 worker) and
// upgrades as the town advances: worker slots grow to 3, output-per-worker keeps
// rising. Future: animal pens, mines, etc.
export const PRODUCTION: Record<'lumberyard' | 'forager', ProductionDef> = {
  lumberyard: {
    kind: 'lumberyard',
    produces: 'wood',
    fieldType: 'forest',
    cost: { wood: 25, food: 0 },
    half: 1.0,
    levels: [
      { name: 'Sawmill', slots: 1, load: 4, workTime: 2.8, reqTier: 0, upgradeCost: null },
      { name: 'Lumber Shed', slots: 2, load: 5, workTime: 2.6, reqTier: 1, upgradeCost: { wood: 45, food: 10 } },
      { name: 'Lumberyard', slots: 3, load: 7, workTime: 2.4, reqTier: 2, upgradeCost: { wood: 100, food: 35 } },
      { name: 'Lumber Mill', slots: 3, load: 10, workTime: 2.2, reqTier: 3, upgradeCost: { wood: 200, food: 90 } },
    ],
  },
  forager: {
    kind: 'forager',
    produces: 'food',
    fieldType: 'berryfield',
    cost: { wood: 20, food: 0 },
    half: 0.9,
    levels: [
      { name: 'Foraging Spot', slots: 1, load: 3, workTime: 2.8, reqTier: 0, upgradeCost: null },
      { name: "Forager's Hut", slots: 2, load: 4, workTime: 2.6, reqTier: 1, upgradeCost: { wood: 40, food: 5 } },
      { name: 'Gathering Lodge', slots: 3, load: 6, workTime: 2.4, reqTier: 2, upgradeCost: { wood: 90, food: 25 } },
      { name: 'Farmstead', slots: 3, load: 8, workTime: 2.2, reqTier: 3, upgradeCost: { wood: 180, food: 70 } },
    ],
  },
}

/** placement margin beyond a field's radius (so you can build on or at its edge) */
export const FIELD_BUILD_RANGE = 2.0
export const HELD_HEIGHT = 1.9 // how high a villager floats while picked up

// keep placements from landing on top of the town center
export const TOWN_CLEAR_RADIUS = 3.2

export const RESOURCE_COLORS: Record<string, string> = {
  wood: '#c9863f',
  food: '#7bc96f',
}

// ---- town-center progression ------------------------------------------------
// Adding a new era is literally appending an entry here. Each tier raises the
// population cap and (later) gates which buildings / tech branches unlock.
export const TOWN_TIERS: TownTier[] = [
  {
    name: 'Campfire',
    era: 'Dawn of Man',
    popCap: 3,
    storageCap: 100,
    territoryRadius: 18,
    color: '#ff8c3b',
    height: 0.5,
  },
  {
    name: 'Tent',
    era: 'Stone Age',
    popCap: 5,
    storageCap: 180,
    territoryRadius: 24,
    upgradeCost: { wood: 30, food: 10 },
    color: '#d8c08a',
    height: 1.3,
  },
  {
    name: 'Longhouse',
    era: 'Bronze Age',
    popCap: 8,
    storageCap: 300,
    territoryRadius: 32,
    upgradeCost: { wood: 80, food: 45 },
    color: '#b5651d',
    height: 2.0,
  },
  {
    name: 'Town Hall',
    era: 'Iron Age',
    popCap: 12,
    storageCap: 500,
    territoryRadius: 42,
    upgradeCost: { wood: 160, food: 110 },
    color: '#9a7b4f',
    height: 2.7,
  },
  {
    name: 'Keep',
    era: 'Medieval',
    popCap: 18,
    storageCap: 800,
    territoryRadius: 54,
    upgradeCost: { wood: 320, food: 220 },
    color: '#8d8d97',
    height: 3.4,
  },
]
