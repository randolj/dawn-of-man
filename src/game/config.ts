import type { Cost, ProductionDef, ProductionKind, ResidenceEra, TownTier } from './types'

// ---- movement & logistics ---------------------------------------------------
export const WALK_SPEED = 2.0 // off-road speed (world units / second)
export const ROAD_SPEED = 4.2 // speed while travelling on a road
export const SCOUT_SPEED = 3.6 // a scout travels briskly across the wilderness
export const DISCOVERY_RADIUS = 22 // how near a scout must get to reveal a village
export const REVEAL_RADIUS = 20 // fog-of-war cleared around a scout's trail (< DISCOVERY so a revealed village is always also discovered)
export const EXPLORE_SPACING = 6 // drop a fog-clearing breadcrumb every this many units travelled
export const VILLAGE_REVEAL_RADIUS = 45 // fog cleared around a village once a scout discovers it
// scouting (and the fog overlay) stay hidden until this town tier —
// 2 = Mithril Age. Bump to 3 for Iron Age.
export const SCOUT_UNLOCK_TIER = 2
export const ROAD_INFLUENCE = 1.1 // how near a road counts as "on" it (~half path width + margin)
export const DEPOSIT_RADIUS = 2.0 // how close to the townhall counts as a delivery
export const WORK_STANDOFF = 1.3 // how far a worker stands from its building

// idle / waiting villagers loiter in this ring around the townhall, pausing briefly
export const WANDER_INNER = 2.8
export const WANDER_OUTER = 4.8
export const IDLE_PAUSE = 1.8 // seconds resting before ambling to a new spot

export const VILLAGER_COST: Cost = { food: 20 }

// ---- manual gathering (drag a villager onto a forest/berry field) -----------
// Deliberately worse than even a level-0 production building, so building one is
// always the upgrade. The field is infinite, so it's a slow "whenever" source.
export const MANUAL_LOAD = 3 // resource carried per trip
export const MANUAL_TIME = 4.0 // seconds per gather (slow)
export const MANUAL_STANDOFF = 0.65 // how far into the field (fraction of radius) a gatherer stands

// ---- hunting (a lodge whose workers chase roaming wildlife for meat) ---------
export const HUNT_RANGE = 36 // how far from the lodge a hunter will seek prey
export const HUNT_KILL_RANGE = 1.5 // how close a hunter must get to make the kill
export const HUNT_SPEED = 2.7 // a hunter moves a touch quicker while on the chase
export const ANIMAL_SPEED = 0.7 // grazing amble speed
export const ANIMAL_RESPAWN = 22 // seconds before a hunted animal returns elsewhere

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
export const PRODUCTION: Record<ProductionKind, ProductionDef> = {
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
    cost: { wood: 20 },
    half: 0.9,
    levels: [
      { name: 'Foraging Spot', slots: 1, load: 3, workTime: 2.8, reqTier: 0, upgradeCost: null },
      { name: "Forager's Hut", slots: 2, load: 4, workTime: 2.6, reqTier: 1, upgradeCost: { wood: 40, food: 5 } },
      { name: 'Gathering Lodge', slots: 3, load: 6, workTime: 2.4, reqTier: 2, upgradeCost: { wood: 90, food: 25 } },
      { name: 'Farmstead', slots: 3, load: 8, workTime: 2.2, reqTier: 3, upgradeCost: { wood: 180, food: 70 } },
    ],
  },
  // --- Mithril Age: mithril is mined straight from deposits (like the quarry on
  // rock). (Smelting/alloys come later — the `consumes` machinery stays dormant.)
  mine: {
    kind: 'mine',
    produces: 'mithril',
    fieldType: 'mithrildeposit',
    cost: { wood: 40, stone: 15 },
    half: 1.0,
    levels: [
      { name: 'Mithril Mine', slots: 1, load: 3, workTime: 3.4, reqTier: 2, upgradeCost: null },
      { name: 'Deep Mine', slots: 2, load: 4, workTime: 3.2, reqTier: 3, upgradeCost: { wood: 120, stone: 40 } },
      { name: 'Great Mine', slots: 3, load: 6, workTime: 3.0, reqTier: 4, upgradeCost: { wood: 220, stone: 90 } },
    ],
  },
  // --- Iron Age: the Smithy forges mithril into weapons (reactivates `consumes`).
  // Weapons arm soldiers for a war party. (Blacksmith + Soldier = the new jobs.)
  smithy: {
    kind: 'smithy',
    produces: 'weapons',
    fieldType: null, // open ground — draws mithril from your stockpile
    consumes: { mithril: 1 },
    cost: { wood: 60, stone: 40 },
    half: 1.0,
    levels: [
      { name: 'Smithy', slots: 1, load: 1, workTime: 3.0, reqTier: 3, upgradeCost: null },
      { name: 'Armory', slots: 2, load: 1, workTime: 2.6, reqTier: 4, upgradeCost: { wood: 150, stone: 70 } },
    ],
  },
  // Meat: a Hunter's Lodge sits on open ground (no field) and its workers range
  // out to chase roaming wildlife, then haul the kill home. Big load per trip,
  // but the travel-to-prey overhead keeps it in check — and prey is finite.
  hunter: {
    kind: 'hunter',
    produces: 'food',
    fieldType: null,
    hunt: true,
    cost: { wood: 25 },
    half: 0.95,
    levels: [
      { name: 'Hunting Camp', slots: 1, load: 8, workTime: 1.6, reqTier: 0, upgradeCost: null },
      { name: "Hunter's Lodge", slots: 2, load: 10, workTime: 1.5, reqTier: 1, upgradeCost: { wood: 45, food: 10 } },
      { name: 'Game Lodge', slots: 3, load: 13, workTime: 1.4, reqTier: 2, upgradeCost: { wood: 100, food: 35 } },
      { name: 'Great Lodge', slots: 3, load: 17, workTime: 1.3, reqTier: 3, upgradeCost: { wood: 200, food: 90 } },
    ],
  },
  // Stone: the expansion resource. Rock outcrops sit outside your starting
  // borders, so a quarry only becomes reachable once you've grown your territory.
  // Slower per load than wood/food — stone is meant to feel earned.
  quarry: {
    kind: 'quarry',
    produces: 'stone',
    fieldType: 'rock',
    cost: { wood: 30 },
    half: 1.0,
    levels: [
      { name: 'Dig Site', slots: 1, load: 3, workTime: 3.4, reqTier: 0, upgradeCost: null },
      { name: 'Quarry', slots: 2, load: 4, workTime: 3.2, reqTier: 2, upgradeCost: { wood: 60, food: 15 } },
      { name: 'Stoneworks', slots: 3, load: 6, workTime: 3.0, reqTier: 3, upgradeCost: { wood: 130, food: 50 } },
      { name: 'Great Quarry', slots: 3, load: 9, workTime: 2.6, reqTier: 4, upgradeCost: { wood: 240, food: 110 } },
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
  stone: '#9aa3ad',
  mithril: '#bfe3ec',
  weapons: '#d05a4a',
}

// the Mithril Age (Longhouse) unlocks mithril + the mine
export const MITHRIL_TIER = 2
// the Iron Age (Town Hall) unlocks weapons + the smithy + attacking villages
export const IRON_TIER = 3

// ---- village interactions (conquer / convert) -------------------------------
export const MARCH_SPEED = 3.4 // a soldier / missionary marches at this speed
export const ENGAGE_RADIUS = 6 // how close a war party must get to attack a village
export const CONVERT_RADIUS = 8 // how close a missionary must get to start preaching
export const CONVERT_RATE = 5 // influence/sec a missionary builds toward conversion (100 = won)
export const MAX_PARTY = 10 // max soldiers in one war party
export const BATTLE_DURATION = 5 // seconds a melee plays out before it resolves
export const OWNED_COLOR = '#e0b84a' // banner/tint of villages that have joined you

// ---- town-center progression ------------------------------------------------
// Adding a new era is literally appending an entry here. Each tier raises the
// population cap and (later) gates which buildings / tech branches unlock.
export const TOWN_TIERS: TownTier[] = [
  {
    name: 'Campfire',
    era: 'Dawn of Man',
    popCap: 3,
    storageCap: 100,
    buildCap: 4,
    territoryRadius: 18,
    color: '#ff8c3b',
    height: 0.5,
  },
  {
    name: 'Tent',
    era: 'Stone Age',
    popCap: 5,
    storageCap: 180,
    buildCap: 7,
    territoryRadius: 24,
    upgradeCost: { wood: 30, food: 10 },
    color: '#d8c08a',
    height: 1.3,
  },
  {
    name: 'Longhouse',
    era: 'Mithril Age',
    popCap: 8,
    storageCap: 300,
    buildCap: 10,
    territoryRadius: 32,
    upgradeCost: { wood: 80, food: 45, stone: 20 },
    color: '#b5651d',
    height: 2.0,
  },
  {
    name: 'Town Hall',
    era: 'Iron Age',
    popCap: 12,
    storageCap: 500,
    buildCap: 14,
    territoryRadius: 42,
    upgradeCost: { wood: 160, food: 110, stone: 60, mithril: 40 },
    color: '#9a7b4f',
    height: 2.7,
  },
  {
    name: 'Keep',
    era: 'Medieval',
    popCap: 18,
    storageCap: 800,
    buildCap: 18,
    territoryRadius: 54,
    upgradeCost: { wood: 320, food: 220, stone: 140 },
    color: '#8d8d97',
    height: 3.4,
  },
]
