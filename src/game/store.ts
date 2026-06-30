import { create } from 'zustand'
import type {
  Animal,
  Battle,
  Building,
  BuildMode,
  Cost,
  FieldType,
  NpcVillage,
  NpcVillager,
  PathSegment,
  ProductionDef,
  ProductionKind,
  ResourceField,
  ResourceType,
  Resources,
  Selection,
  Toast,
  Villager,
  Vec2,
} from './types'
import {
  DEPOSIT_RADIUS,
  FIELD_BUILD_RANGE,
  IDLE_PAUSE,
  MANUAL_LOAD,
  MANUAL_STANDOFF,
  MANUAL_TIME,
  PRODUCTION,
  ANIMAL_RESPAWN,
  ANIMAL_SPEED,
  BATTLE_DURATION,
  CONVERT_RADIUS,
  CONVERT_RATE,
  ENGAGE_RADIUS,
  IRON_TIER,
  MARCH_SPEED,
  MAX_PARTY,
  MITHRIL_TIER,
  DISCOVERY_RADIUS,
  EXPLORE_SPACING,
  HUNT_KILL_RANGE,
  HUNT_RANGE,
  HUNT_SPEED,
  RESIDENCE_ERAS,
  RESIDENCE_HALF,
  ROAD_INFLUENCE,
  ROAD_SPEED,
  SCOUT_SPEED,
  TOWN_CLEAR_RADIUS,
  TOWN_TIERS,
  VILLAGER_COST,
  WALK_SPEED,
  WANDER_INNER,
  WANDER_OUTER,
  WORK_STANDOFF,
} from './config'
import { FIELDS } from './fields'
import { makeNpcVillages } from './npc'
import { makeAnimals } from './animals'
import { clearSave, readSave, writeSave, SAVE_VERSION, type SaveData } from './save'

// ---- resource bookkeeping (generic over ResourceType so adding a resource is
// a config change, not new logic) -------------------------------------------
export const RESOURCE_TYPES: ResourceType[] = ['wood', 'food', 'stone', 'mithril', 'weapons']

/** a zeroed stockpile */
function emptyResources(): Resources {
  return { wood: 0, food: 0, stone: 0, mithril: 0, weapons: 0 }
}

/** can `have` pay `cost`? (resources omitted from a cost are free) */
function affords(have: Resources, cost: Cost): boolean {
  return RESOURCE_TYPES.every((t) => (cost[t] ?? 0) <= have[t])
}

/** `have` minus `cost`, as a fresh stockpile */
function spend(have: Resources, cost: Cost): Resources {
  const out = { ...have }
  for (const t of RESOURCE_TYPES) out[t] -= cost[t] ?? 0
  return out
}

/** human-readable price, e.g. "80 wood · 45 food · 20 stone" (or "free") */
export function costText(cost: Cost): string {
  const parts = RESOURCE_TYPES.filter((t) => (cost[t] ?? 0) > 0).map((t) => `${cost[t]} ${t}`)
  return parts.length ? parts.join(' · ') : 'free'
}

/** total population added by residences (houses only), each at its era capacity */
export function residencePop(buildings: Building[]): number {
  return buildings
    .filter((b) => b.kind === 'house')
    .reduce((sum, b) => sum + (RESIDENCE_ERAS[b.level]?.popBonus ?? 0), 0)
}

const PRODUCTION_KINDS = new Set<string>([
  'lumberyard',
  'forager',
  'quarry',
  'hunter',
  'mine',
  'smithy',
])
export function isProduction(b: Building): b is Building & { kind: ProductionKind } {
  return PRODUCTION_KINDS.has(b.kind)
}

/** which resource a natural field yields when gathered */
function fieldResource(f: ResourceField): ResourceType {
  switch (f.type) {
    case 'forest':
      return 'wood'
    case 'berryfield':
      return 'food'
    case 'rock':
      return 'stone'
    case 'mithrildeposit':
      return 'mithril'
  }
}

function defOf(b: Building): ProductionDef | null {
  return isProduction(b) ? PRODUCTION[b.kind] : null
}

/** the current level stats of a production building (clamped) */
export function prodLevel(b: Building) {
  if (!isProduction(b)) return null
  const levels = PRODUCTION[b.kind].levels
  return levels[Math.min(b.level, levels.length - 1)]
}

/** is a higher level unlocked by the current town tier (regardless of cost)? */
export function productionUpgradeAvailable(b: Building, tierIndex: number): boolean {
  if (!isProduction(b)) return false
  const levels = PRODUCTION[b.kind].levels
  const next = levels[b.level + 1]
  return !!next && tierIndex >= next.reqTier
}

function buildingHalf(b: Building): number {
  return isProduction(b) ? PRODUCTION[b.kind].half : RESIDENCE_HALF
}

// The townhall always sits at the world origin.
export const TOWN_CENTER: Vec2 = { x: 0, z: 0 }

let nextVillagerId = 1
let nextBuildingId = 1
let nextPathId = 1
let nextToastId = 1

// --- vector helpers ----------------------------------------------------------
function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** Move `pos` toward `target` by up to `step`. Returns true once it arrives. */
function moveToward(pos: Vec2, target: Vec2, step: number): boolean {
  const dx = target.x - pos.x
  const dz = target.z - pos.z
  const d = Math.hypot(dx, dz)
  if (d <= step || d === 0) {
    pos.x = target.x
    pos.z = target.z
    return true
  }
  pos.x += (dx / d) * step
  pos.z += (dz / d) * step
  return false
}

/** distance from point p to segment a-b */
function pointSegDist(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b.x - a.x
  const vz = b.z - a.z
  const wx = p.x - a.x
  const wz = p.z - a.z
  const c1 = vx * wx + vz * wz
  if (c1 <= 0) return dist(p, a)
  const c2 = vx * vx + vz * vz
  if (c2 <= c1) return dist(p, b)
  const t = c1 / c2
  return Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz))
}

/** is this point sitting on (close to) any road segment? */
function onRoad(p: Vec2, paths: PathSegment[]): boolean {
  for (const s of paths) if (pointSegDist(p, s.a, s.b) < ROAD_INFLUENCE) return true
  return false
}

/** travel step for this frame: faster while on a road */
function travelStep(p: Vec2, paths: PathSegment[], dt: number): number {
  return (onRoad(p, paths) ? ROAD_SPEED : WALK_SPEED) * dt
}

// --- road network routing ----------------------------------------------------
// Build a graph from path endpoints so workers actually *follow* roads instead
// of walking straight and hoping to cross one.
const NODE_MERGE = 0.6 // endpoints this close are the same junction
const ROAD_ACCESS = 3.6 // how far a building / townhall can be from a road to use it
// Within this distance of the final target we leave the road and walk straight
// in. Must exceed ROAD_ACCESS so we always peel off *before* reaching an exit
// node that the road carried past the target (e.g. a path drawn past the base) —
// otherwise the worker overshoots the target and doubles back.
const ROAD_EXIT = 4.0

interface RoadGraph {
  nodes: Vec2[]
  adj: Array<Array<{ to: number; w: number }>>
}
let cachedPaths: PathSegment[] | null = null
let cachedGraph: RoadGraph | null = null

function roadGraph(paths: PathSegment[]): RoadGraph {
  if (paths === cachedPaths && cachedGraph) return cachedGraph
  const nodes: Vec2[] = []
  const adj: RoadGraph['adj'] = []
  const idxFor = (p: Vec2): number => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) < NODE_MERGE) return i
    nodes.push({ x: p.x, z: p.z })
    adj.push([])
    return nodes.length - 1
  }
  for (const s of paths) {
    const i = idxFor(s.a)
    const j = idxFor(s.b)
    if (i === j) continue
    const w = dist(s.a, s.b)
    adj[i].push({ to: j, w })
    adj[j].push({ to: i, w })
  }
  cachedPaths = paths
  cachedGraph = { nodes, adj }
  return cachedGraph
}

/** every graph node within `maxDist` of point `p` (a valid road entry/exit) */
function nodesWithin(nodes: Vec2[], p: Vec2, maxDist: number): number[] {
  const out: number[] = []
  for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= maxDist) out.push(i)
  return out
}

/** Dijkstra over the (small) road graph from source `s`; returns dist + prev */
function dijkstra(adj: RoadGraph['adj'], n: number, s: number) {
  const best = new Array(n).fill(Infinity)
  const prev = new Array(n).fill(-1)
  const done = new Array(n).fill(false)
  best[s] = 0
  for (let iter = 0; iter < n; iter++) {
    let u = -1
    let ud = Infinity
    for (let i = 0; i < n; i++) if (!done[i] && best[i] < ud) (ud = best[i]), (u = i)
    if (u === -1) break
    done[u] = true
    for (const e of adj[u]) {
      const nd = best[u] + e.w
      if (nd < best[e.to]) {
        best[e.to] = nd
        prev[e.to] = u
      }
    }
  }
  return { best, prev }
}

/**
 * Waypoints from `from` to `to` that follow the road network when one connects
 * both ends; otherwise null (caller walks straight). The returned list ends at
 * `to`; the leg from `from` to the first waypoint is implicit.
 *
 * Either end may sit near several road nodes (e.g. multiple roads reaching the
 * townhall), so we consider ALL nodes within range of each end and pick the
 * cheapest connected pair — never just the single nearest node.
 */
function roadRouteTo(from: Vec2, to: Vec2, paths: PathSegment[]): Vec2[] | null {
  if (paths.length === 0) return null
  const { nodes, adj } = roadGraph(paths)
  if (nodes.length === 0) return null
  const starts = nodesWithin(nodes, from, ROAD_ACCESS)
  const ends = nodesWithin(nodes, to, ROAD_ACCESS)
  if (!starts.length || !ends.length) return null

  let bestCost = Infinity
  let bestEnd = -1
  let bestPrev: number[] | null = null
  for (const s of starts) {
    const { best, prev } = dijkstra(adj, nodes.length, s)
    const lead = dist(from, nodes[s]) // walk from `from` to entry node
    for (const t of ends) {
      if (best[t] === Infinity) continue
      const cost = lead + best[t] + dist(nodes[t], to)
      if (cost < bestCost) {
        bestCost = cost
        bestEnd = t
        bestPrev = prev
      }
    }
  }
  if (bestEnd < 0 || !bestPrev) return null

  const idxPath: number[] = []
  for (let c = bestEnd; c !== -1; c = bestPrev[c]) idxPath.push(c)
  idxPath.reverse()
  const pts: Vec2[] = idxPath.map((i) => ({ x: nodes[i].x, z: nodes[i].z }))
  pts.push({ x: to.x, z: to.z })
  return pts
}

/** does a road connect this spot to the townhall? (used for the "no road" cue) */
export function roadConnected(pos: Vec2, paths: PathSegment[]): boolean {
  return roadRouteTo(pos, TOWN_CENTER, paths) !== null
}

/**
 * Can the player actually reach (build on / gather) a rock outcrop yet? Stone
 * stays hidden from the UI until this is true — i.e. until your borders grow to
 * touch a rock field. Derived from real geometry so it tracks any retuning.
 */
export function stoneUnlocked(tierIndex: number): boolean {
  const r = TOWN_TIERS[tierIndex].territoryRadius
  return FIELDS.some(
    (f) => f.type === 'rock' && dist(f.pos, TOWN_CENTER) - (f.radius + FIELD_BUILD_RANGE) <= r,
  )
}

/** is a resource revealed to the player yet? (hidden in the UI until usable) */
export function resourceUnlocked(type: ResourceType, tierIndex: number): boolean {
  if (type === 'wood' || type === 'food') return true
  if (type === 'stone') return stoneUnlocked(tierIndex)
  if (type === 'weapons') return tierIndex >= IRON_TIER // weapons arrive with the Iron Age
  return tierIndex >= MITHRIL_TIER // mithril arrives with the Mithril Age
}

// While drawing a path, a point this close to a key spot (the townhall or a
// building) snaps onto it — so roads reliably *connect* instead of landing just
// short of, or past, what they're meant to join.
const PATH_SNAP = 2.6

/**
 * Snap a path point to the nearest key spot (townhall / any building) within
 * PATH_SNAP, else leave it where it is. `target` is the snapped-to spot (for a
 * placement cue), or null when nothing was in range.
 */
export function snapPathPoint(
  p: Vec2,
  buildings: Building[],
): { point: Vec2; target: Vec2 | null } {
  const candidates: Vec2[] = [TOWN_CENTER, ...buildings.map((b) => b.pos)]
  let best: Vec2 | null = null
  let bestD = PATH_SNAP
  for (const q of candidates) {
    const d = dist(p, q)
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return best ? { point: { x: best.x, z: best.z }, target: best } : { point: p, target: null }
}

/** resting / working spot for the Nth worker around a building */
function workSpot(b: Building, slot: number, slots: number): Vec2 {
  const a = (slot / Math.max(1, slots)) * Math.PI * 2 + 0.4
  return { x: b.pos.x + Math.cos(a) * WORK_STANDOFF, z: b.pos.z + Math.sin(a) * WORK_STANDOFF }
}

/** a spot `standoff` from `target`, on the side `from` approaches from */
function approachSpot(target: Vec2, from: Vec2, standoff: number): Vec2 {
  const dx = from.x - target.x
  const dz = from.z - target.z
  const d = Math.hypot(dx, dz) || 1
  return { x: target.x + (dx / d) * standoff, z: target.z + (dz / d) * standoff }
}

function faceToward(v: Villager, target: Vec2) {
  v.heading = Math.atan2(target.x - v.pos.x, target.z - v.pos.z)
}

// spawn position: a small ring around the campfire
function spawnSpot(index: number): Vec2 {
  const a = (index / 6) * Math.PI * 2
  const r = 1.7
  return { x: Math.cos(a) * r, z: Math.sin(a) * r }
}

function makeVillager(index: number): Villager {
  return {
    id: nextVillagerId++,
    pos: spawnSpot(index),
    heading: 0,
    state: 'idle',
    workplaceId: null,
    carry: 0,
    carryType: null,
    forageFieldId: null,
    wanderTarget: null,
    workTimer: 0,
    route: null,
    routeIndex: 0,
    scoutTarget: null,
    scoutReturning: false,
    huntAnimalId: null,
    targetVillageId: null,
    bob: index * 1.7,
  }
}

// a wild animal ambling within its home range, pausing on arrival
function animalGraze(an: Animal, dt: number) {
  if (an.wanderTarget && dist(an.pos, an.wanderTarget) > 0.3) {
    an.heading = Math.atan2(an.wanderTarget.x - an.pos.x, an.wanderTarget.z - an.pos.z)
    moveToward(an.pos, an.wanderTarget, ANIMAL_SPEED * dt)
  } else {
    an.restTimer += dt
    if (!an.wanderTarget || an.restTimer >= 2.5) {
      const a = Math.random() * Math.PI * 2
      const rad = 2 + Math.random() * 5
      an.wanderTarget = { x: an.home.x + Math.cos(a) * rad, z: an.home.z + Math.sin(a) * rad }
      an.restTimer = 0
    }
  }
}

/** nearest living animal to `p` within `range`, or null */
function nearestPrey(animals: Animal[], p: Vec2, range: number): Animal | null {
  let best: Animal | null = null
  let bestD = range
  for (const an of animals) {
    if (!an.alive) continue
    const d = dist(p, an.pos)
    if (d < bestD) {
      bestD = d
      best = an
    }
  }
  return best
}

// a loiter point in the ring around the townhall, near the villager's current
// angle so they circle the tent rather than cutting straight across it
function townWanderSpot(from: Vec2): Vec2 {
  const cur = Math.atan2(from.z - TOWN_CENTER.z, from.x - TOWN_CENTER.x)
  const a = cur + (Math.random() - 0.5) * 1.7
  const r = WANDER_INNER + Math.random() * (WANDER_OUTER - WANDER_INNER)
  return { x: TOWN_CENTER.x + Math.cos(a) * r, z: TOWN_CENTER.z + Math.sin(a) * r }
}

// gently amble between spots around the townhall, pausing on arrival
function wanderAroundTown(v: Villager, dt: number) {
  if (v.wanderTarget && dist(v.pos, v.wanderTarget) > 0.3) {
    faceToward(v, v.wanderTarget)
    moveToward(v.pos, v.wanderTarget, WALK_SPEED * 0.42 * dt)
  } else {
    v.workTimer += dt
    if (!v.wanderTarget || v.workTimer >= IDLE_PAUSE) {
      v.wanderTarget = townWanderSpot(v.pos)
      v.workTimer = 0
    }
  }
}

// an NPC villager ambles slowly within a ring around its village center,
// pausing on arrival — purely cosmetic "village life", no economy attached
function npcWander(nv: NpcVillager, center: Vec2, radius: number, dt: number) {
  if (nv.wanderTarget && dist(nv.pos, nv.wanderTarget) > 0.3) {
    nv.heading = Math.atan2(nv.wanderTarget.x - nv.pos.x, nv.wanderTarget.z - nv.pos.z)
    moveToward(nv.pos, nv.wanderTarget, WALK_SPEED * 0.4 * dt)
  } else {
    nv.restTimer += dt
    if (!nv.wanderTarget || nv.restTimer >= IDLE_PAUSE) {
      const a = Math.random() * Math.PI * 2
      const rad = radius * (0.25 + Math.random() * 0.55)
      nv.wanderTarget = { x: center.x + Math.cos(a) * rad, z: center.z + Math.sin(a) * rad }
      nv.restTimer = 0
    }
  }
}

// where attackers and defenders meet — just outside the village, on the home side
function clashPoint(center: Vec2): Vec2 {
  const dx = TOWN_CENTER.x - center.x
  const dz = TOWN_CENTER.z - center.z
  const d = Math.hypot(dx, dz) || 1
  return { x: center.x + (dx / d) * 5, z: center.z + (dz / d) * 5 }
}

/** start a road-aware trip from the villager's current spot to `target` */
function beginTrip(v: Villager, target: Vec2, paths: PathSegment[]) {
  v.route = roadRouteTo(v.pos, target, paths) ?? [{ x: target.x, z: target.z }]
  v.routeIndex = 0
}

/**
 * Advance the villager along its route this frame. Returns true once within
 * `arrive` of the final target. When within `cut` of that target we abandon any
 * remaining road waypoints and head straight in — without this, a road whose
 * exit node lies *past* the target (a path drawn beyond the base) would march
 * the villager out to that node and back.
 */
function advanceRoute(
  v: Villager,
  paths: PathSegment[],
  dt: number,
  cut: number,
  arrive: number,
): boolean {
  if (!v.route || v.route.length === 0) return true
  const target = v.route[v.route.length - 1]
  if (dist(v.pos, target) <= arrive) return true
  // near the destination: skip leftover road nodes and aim straight at it
  const wp = dist(v.pos, target) <= cut ? target : v.route[Math.min(v.routeIndex, v.route.length - 1)]
  faceToward(v, wp)
  if (moveToward(v.pos, wp, travelStep(v.pos, paths, dt)) && wp !== target) v.routeIndex++
  return dist(v.pos, target) <= arrive
}

interface GameState {
  resources: Resources
  villagers: Villager[]
  tierIndex: number

  /** neutral AI settlements out in the world (idle + passive economy) */
  npcVillages: NpcVillage[]
  /** roaming wildlife hunters can chase (ambient; not persisted) */
  animals: Animal[]
  /** in-progress melees at villages (transient; not persisted) */
  battles: Battle[]
  /** fog-of-war breadcrumbs (spots a scout has explored) */
  explored: Vec2[]

  buildings: Building[]
  paths: PathSegment[]
  buildMode: BuildMode
  pathDraft: Vec2[]
  cursorGround: Vec2
  heldId: number | null
  /** field currently under the cursor (for the tooltip), with screen position */
  hover: { fieldId: number; x: number; y: number } | null
  /** how many starter objectives have been completed (index into OBJECTIVES) */
  objectiveStep: number
  toasts: Toast[]
  firstWoodDelivered: boolean
  firstFoodDelivered: boolean
  /** building/townhall currently open in the management panel */
  selection: Selection

  // selectors / derived
  popCap: () => number
  storageCap: () => number
  /** max buildings allowed at the current tier */
  buildCap: () => number
  /** are we already at the building limit for this tier? */
  atBuildCap: () => boolean
  territoryRadius: () => number
  canAfford: (cost: Partial<Resources>) => boolean
  canPlaceAt: (p: Vec2, half: number) => boolean
  canPlaceProduction: (p: Vec2, kind: ProductionKind) => boolean

  // simulation
  tick: (dt: number) => void

  // town
  upgradeTownCenter: () => void
  trainVillager: () => void

  // building / editing
  setBuildMode: (mode: BuildMode) => void
  setCursorGround: (p: Vec2) => void
  setHover: (h: { fieldId: number; x: number; y: number } | null) => void
  placeResidence: (p: Vec2) => void
  upgradeResidence: (buildingId: number) => void
  placeProduction: (p: Vec2, kind: ProductionKind) => void
  staffBuilding: (buildingId: number) => void
  upgradeProduction: (buildingId: number) => void
  gatherField: (fieldId: number) => void
  addPathPoint: (p: Vec2) => void
  endPath: () => void

  // selection
  selectBuilding: (id: number) => void
  selectTownhall: () => void
  selectNpc: (id: number) => void
  clearSelection: () => void
  /** send the nearest idle villager to scout (and reveal fog toward) a spot */
  sendScoutTo: (p: Vec2) => void
  /** muster a war party (idle villagers armed with weapons) to attack a village */
  attackVillage: (villageId: number) => void
  /** send an idle villager to a village as a missionary to convert it */
  sendMissionary: (villageId: number) => void

  // ---- persistence + debug ----
  saveGame: () => void
  resetGame: () => void
  /** debug: rebuild a representative base for the given town tier */
  debugSetupEra: (tier: number) => void
  /** debug: reveal every NPC village */
  debugDiscoverAll: () => void

  // feedback
  pushToast: (msg: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void

  // hand of god
  pickUpVillager: (villagerId: number) => void
  moveHeld: (p: Vec2) => void
  dropHeld: () => void
}

// ---- starter objectives (the early-game tutorial chain) ---------------------
export interface ObjectiveDef {
  id: string
  title: string
  /** build tool this step nudges you toward (for highlighting), or null */
  tool: BuildMode | null
  done: (g: GameState) => boolean
}

export const OBJECTIVES: ObjectiveDef[] = [
  {
    id: 'chop',
    title: 'Click a forest (or drag a villager onto it) to chop wood',
    tool: 'none',
    done: (g) => g.villagers.some((v) => v.forageFieldId !== null) || g.resources.wood >= 25,
  },
  {
    id: 'lumber',
    title: 'Build a Lumberyard on a forest',
    tool: 'lumberyard',
    done: (g) => g.buildings.some((b) => b.kind === 'lumberyard'),
  },
  {
    id: 'staff',
    title: 'Put a villager to work',
    tool: 'none',
    done: (g) => g.buildings.some((b) => isProduction(b) && b.workers.length > 0),
  },
  {
    id: 'road',
    title: 'Connect it with a road',
    tool: 'path',
    done: (g) => g.buildings.some((b) => isProduction(b) && roadConnected(b.pos, g.paths)),
  },
  {
    id: 'house',
    title: 'Build a house',
    tool: 'house',
    done: (g) => g.buildings.some((b) => b.kind === 'house'),
  },
  {
    id: 'train',
    title: 'Train a new villager',
    tool: null,
    done: (g) => g.villagers.length > 3,
  },
  {
    id: 'era',
    title: 'Reach the Stone Age',
    tool: null,
    done: (g) => g.tierIndex >= 1,
  },
  {
    id: 'mithril',
    title: 'Quarry stone and reach the Mithril Age',
    tool: null,
    done: (g) => g.tierIndex >= 2,
  },
  {
    id: 'scout',
    title: 'Send a scout to find your neighbours',
    tool: null,
    done: (g) => g.npcVillages.some((v) => v.discovered),
  },
]

// the persisted slice of state (the rest is transient UI / derived selectors)
type PersistSlice = Pick<
  GameState,
  | 'resources'
  | 'tierIndex'
  | 'villagers'
  | 'buildings'
  | 'paths'
  | 'npcVillages'
  | 'explored'
  | 'objectiveStep'
  | 'firstWoodDelivered'
  | 'firstFoodDelivered'
>

/** a brand-new game (also resets the id counters) */
function freshState(): PersistSlice {
  nextVillagerId = 1
  nextBuildingId = 1
  nextPathId = 1
  return {
    // start poor: not enough to build a lumberyard or upgrade the townhall.
    resources: { wood: 5, food: 20, stone: 0, mithril: 0, weapons: 0 },
    villagers: [makeVillager(0), makeVillager(1), makeVillager(2)],
    tierIndex: 0,
    npcVillages: makeNpcVillages(),
    explored: [],
    buildings: [],
    paths: [],
    objectiveStep: 0,
    firstWoodDelivered: false,
    firstFoodDelivered: false,
  }
}

/** restore a save: sanitise it and resume id counters past the loaded ids */
function applySave(d: SaveData): PersistSlice {
  const villagers = d.villagers.map((v) =>
    v.state === 'held' ? { ...v, state: 'idle' as const } : v,
  )
  const maxId = (arr: { id: number }[]) => arr.reduce((m, x) => Math.max(m, x.id), 0)
  nextVillagerId = maxId(villagers) + 1
  nextBuildingId = maxId(d.buildings) + 1
  nextPathId = maxId(d.paths) + 1
  return {
    resources: d.resources,
    tierIndex: d.tierIndex,
    villagers,
    buildings: d.buildings,
    paths: d.paths,
    npcVillages: d.npcVillages,
    explored: d.explored ?? [],
    objectiveStep: d.objectiveStep,
    firstWoodDelivered: d.firstWoodDelivered,
    firstFoodDelivered: d.firstFoodDelivered,
  }
}

/** load a save if one exists, else a fresh game */
function makeInitialState(): PersistSlice {
  const saved = readSave()
  return saved ? applySave(saved) : freshState()
}

/** the current state as a save payload */
function toSave(s: GameState): SaveData {
  return {
    version: SAVE_VERSION,
    resources: s.resources,
    tierIndex: s.tierIndex,
    villagers: s.villagers,
    buildings: s.buildings,
    paths: s.paths,
    npcVillages: s.npcVillages,
    explored: s.explored,
    objectiveStep: s.objectiveStep,
    firstWoodDelivered: s.firstWoodDelivered,
    firstFoodDelivered: s.firstFoodDelivered,
  }
}

export const useGame = create<GameState>((set, get) => ({
  ...makeInitialState(),

  // ambient wildlife — regenerated each session, not part of the save
  animals: makeAnimals(),
  battles: [],

  // transient UI state — never persisted
  buildMode: 'none',
  pathDraft: [],
  cursorGround: { x: 0, z: 0 },
  heldId: null,
  hover: null,
  toasts: [],
  selection: null,

  popCap: () => {
    const s = get()
    return TOWN_TIERS[s.tierIndex].popCap + residencePop(s.buildings)
  },

  storageCap: () => TOWN_TIERS[get().tierIndex].storageCap,
  buildCap: () => TOWN_TIERS[get().tierIndex].buildCap,
  atBuildCap: () => get().buildings.length >= TOWN_TIERS[get().tierIndex].buildCap,
  territoryRadius: () => TOWN_TIERS[get().tierIndex].territoryRadius,

  canAfford: (cost) => affords(get().resources, cost),

  canPlaceAt: (p, half) => {
    if (dist(p, TOWN_CENTER) > get().territoryRadius()) return false // outside your borders
    if (dist(p, TOWN_CENTER) < TOWN_CLEAR_RADIUS + half) return false
    for (const b of get().buildings) {
      if (dist(p, b.pos) < buildingHalf(b) + half + 0.4) return false
    }
    return true
  },

  // production buildings must sit on a matching natural field (or open ground
  // for field-less ones like the hunter's lodge)
  canPlaceProduction: (p, kind) => {
    const def = PRODUCTION[kind]
    if (!get().canPlaceAt(p, def.half)) return false
    if (!def.fieldType) return true
    return FIELDS.some(
      (f) => f.type === def.fieldType && dist(p, f.pos) <= f.radius + FIELD_BUILD_RANGE,
    )
  },

  tick: (dt) => {
    const { villagers, buildings, paths, resources } = get()
    const cap = TOWN_TIERS[get().tierIndex].storageCap
    const gained = emptyResources()
    const discovered: string[] = [] // villages a scout reached this tick
    const reached = new Set<number>() // villages a war party reached this tick (start a battle)

    // a worker's resource is "full" once the live stockpile (incl. this tick's
    // deliveries so far) hits the cap — those workers loiter instead of working.
    const isFull = (type: ResourceType) => resources[type] + gained[type] >= cap

    for (const v of villagers) {
      switch (v.state) {
        case 'idle': {
          wanderAroundTown(v, dt)
          break
        }

        case 'scouting': {
          if (!v.scoutTarget) {
            v.state = 'idle'
            break
          }
          faceToward(v, v.scoutTarget)
          const reached = moveToward(v.pos, v.scoutTarget, SCOUT_SPEED * dt)
          // clear fog along the trail: drop a breadcrumb every EXPLORE_SPACING
          const ex = get().explored
          const lastEx = ex[ex.length - 1]
          if (!lastEx || dist(v.pos, lastEx) > EXPLORE_SPACING) ex.push({ x: v.pos.x, z: v.pos.z })
          // reveal any undiscovered village the scout passes near
          for (const village of get().npcVillages) {
            if (!village.discovered && dist(v.pos, village.center) <= DISCOVERY_RADIUS) {
              village.discovered = true
              discovered.push(village.name)
            }
          }
          if (reached) {
            if (v.scoutReturning) {
              v.state = 'idle'
              v.scoutTarget = null
              v.scoutReturning = false
            } else {
              // mission done — head home
              v.scoutReturning = true
              v.scoutTarget = { x: TOWN_CENTER.x, z: TOWN_CENTER.z }
            }
          }
          break
        }

        case 'marching': {
          const village =
            v.targetVillageId != null
              ? get().npcVillages.find((x) => x.id === v.targetVillageId)
              : null
          if (!village || village.owner !== 'neutral') {
            v.state = 'idle' // target's gone or already taken — stand down
            v.targetVillageId = null
            break
          }
          faceToward(v, village.center)
          moveToward(v.pos, village.center, MARCH_SPEED * dt)
          if (dist(v.pos, village.center) <= ENGAGE_RADIUS) reached.add(village.id)
          break
        }

        case 'fighting': {
          const village =
            v.targetVillageId != null
              ? get().npcVillages.find((x) => x.id === v.targetVillageId)
              : null
          if (!village) {
            v.state = 'idle'
            v.targetVillageId = null
            break
          }
          // close to the melee line and trade blows (the battle timer resolves it)
          const clash = clashPoint(village.center)
          faceToward(v, clash)
          if (dist(v.pos, clash) > 1.6) moveToward(v.pos, clash, MARCH_SPEED * 0.55 * dt)
          break
        }

        case 'converting': {
          const village =
            v.targetVillageId != null
              ? get().npcVillages.find((x) => x.id === v.targetVillageId)
              : null
          if (!village || village.owner !== 'neutral') {
            v.state = 'idle'
            v.targetVillageId = null
            break
          }
          faceToward(v, village.center)
          if (dist(v.pos, village.center) > CONVERT_RADIUS) {
            moveToward(v.pos, village.center, MARCH_SPEED * dt)
          } else {
            village.influence = Math.min(100, village.influence + CONVERT_RATE * dt) // preach
          }
          break
        }

        case 'waiting': {
          const b = v.workplaceId != null ? buildings.find((x) => x.id === v.workplaceId) : null
          const f = v.forageFieldId != null ? FIELDS.find((x) => x.id === v.forageFieldId) : null
          const produces = b && defOf(b) ? defOf(b)!.produces : f ? fieldResource(f) : null
          if (!produces) {
            v.state = 'idle'
            v.workplaceId = null
            v.forageFieldId = null
            v.wanderTarget = null
            break
          }
          // resume the moment the stockpile has room again
          if (!isFull(produces)) {
            v.state = 'toWork'
            v.route = null
            v.wanderTarget = null
          } else {
            wanderAroundTown(v, dt)
          }
          break
        }

        case 'toWork': {
          const b = v.workplaceId != null ? buildings.find((x) => x.id === v.workplaceId) : null
          const f = v.forageFieldId != null ? FIELDS.find((x) => x.id === v.forageFieldId) : null
          if (b) {
            const lvl = prodLevel(b)
            const def = defOf(b)
            if (!lvl || !def) {
              v.state = 'idle'
              v.workplaceId = null
              v.route = null
              break
            }
            if (isFull(def.produces)) {
              v.state = 'waiting'
              v.route = null
              v.wanderTarget = null
              break
            }
            const slot = Math.max(0, b.workers.indexOf(v.id))
            const spot = workSpot(b, slot, lvl.slots)
            if (v.route === null) beginTrip(v, spot, paths)
            if (advanceRoute(v, paths, dt, ROAD_EXIT, 0.25)) {
              v.state = 'working'
              v.workTimer = 0
              v.route = null
            }
          } else if (f) {
            if (isFull(fieldResource(f))) {
              // stores full: abandon this one-shot gather and return to idle
              v.state = 'idle'
              v.forageFieldId = null
              v.route = null
              v.wanderTarget = null
              break
            }
            const spot = approachSpot(f.pos, v.pos, f.radius * MANUAL_STANDOFF)
            if (v.route === null) beginTrip(v, spot, paths)
            if (advanceRoute(v, paths, dt, ROAD_EXIT, 0.25)) {
              v.state = 'working'
              v.workTimer = 0
              v.route = null
            }
          } else {
            v.state = 'idle'
            v.workplaceId = null
            v.forageFieldId = null
            v.route = null
          }
          break
        }

        case 'working': {
          const b = v.workplaceId != null ? buildings.find((x) => x.id === v.workplaceId) : null
          const f = v.forageFieldId != null ? FIELDS.find((x) => x.id === v.forageFieldId) : null
          if (b) {
            const def = defOf(b)
            const lvl = prodLevel(b)
            if (!def || !lvl) {
              v.state = 'idle'
              v.workplaceId = null
              break
            }
            if (isFull(def.produces)) {
              v.state = 'waiting'
              v.wanderTarget = null
              break
            }
            if (def.hunt) {
              // a hunter ranges out for prey instead of standing at the lodge
              const prey = nearestPrey(get().animals, b.pos, HUNT_RANGE)
              if (prey) {
                v.huntAnimalId = prey.id
                v.state = 'hunting'
                v.route = null
              } else {
                faceToward(v, b.pos) // no game nearby — loiter until some wanders in
              }
              break
            }
            faceToward(v, b.pos)
            v.workTimer += dt
            if (v.workTimer >= lvl.workTime) {
              const inputs = def.consumes
              // a crafting building must draw its inputs from the stockpile;
              // with none in stock it idles, ready, until the ore arrives
              if (inputs && !RESOURCE_TYPES.every((t) => resources[t] + gained[t] >= (inputs[t] ?? 0))) {
                v.workTimer = lvl.workTime
              } else {
                if (inputs) for (const t of RESOURCE_TYPES) gained[t] -= inputs[t] ?? 0
                v.carry = lvl.load
                v.carryType = def.produces
                v.state = 'hauling'
                v.route = null
              }
            }
          } else if (f) {
            const res = fieldResource(f)
            if (isFull(res)) {
              // stores full: abandon this one-shot gather and return to idle
              v.state = 'idle'
              v.forageFieldId = null
              v.wanderTarget = null
              break
            }
            faceToward(v, f.pos)
            v.workTimer += dt
            if (v.workTimer >= MANUAL_TIME) {
              v.carry = MANUAL_LOAD
              v.carryType = res
              v.state = 'hauling'
              v.route = null
            }
          } else {
            v.state = 'idle'
            v.workplaceId = null
            v.forageFieldId = null
          }
          break
        }

        case 'hunting': {
          const b = v.workplaceId != null ? buildings.find((x) => x.id === v.workplaceId) : null
          const def = b ? defOf(b) : null
          const lvl = b ? prodLevel(b) : null
          if (!b || !def || !lvl || !def.hunt) {
            v.state = 'idle'
            v.workplaceId = null
            v.huntAnimalId = null
            break
          }
          const prey =
            v.huntAnimalId != null
              ? get().animals.find((a) => a.id === v.huntAnimalId && a.alive) ?? null
              : null
          if (!prey) {
            // the quarry got away (killed by another / despawned) — regroup at the lodge
            v.huntAnimalId = null
            v.state = 'toWork'
            v.route = null
            break
          }
          faceToward(v, prey.pos)
          moveToward(v.pos, prey.pos, HUNT_SPEED * dt)
          if (dist(v.pos, prey.pos) <= HUNT_KILL_RANGE) {
            prey.alive = false
            prey.respawnTimer = ANIMAL_RESPAWN
            v.huntAnimalId = null
            v.carry = lvl.load
            v.carryType = 'food'
            v.state = 'hauling'
            v.route = null
          }
          break
        }

        case 'hauling': {
          if (v.route === null) beginTrip(v, TOWN_CENTER, paths)
          // deposit on arrival within DEPOSIT_RADIUS; the road-exit cut keeps the
          // worker from overshooting the base when a path is drawn past it
          if (advanceRoute(v, paths, dt, ROAD_EXIT, DEPOSIT_RADIUS)) {
            if (v.carry > 0 && v.carryType) gained[v.carryType] += v.carry
            v.carry = 0
            v.route = null
            const b = v.workplaceId != null ? buildings.find((x) => x.id === v.workplaceId) : null
            const def = b ? defOf(b) : null
            const f = v.forageFieldId != null ? FIELDS.find((x) => x.id === v.forageFieldId) : null
            if (b && def && prodLevel(b)) v.state = isFull(def.produces) ? 'waiting' : 'toWork'
            // manual gather is one-shot: after delivering, the villager idles —
            // the player triggers each trip (click a forest, or drag a villager onto it)
            else if (f) {
              v.state = 'idle'
              v.forageFieldId = null
              v.carryType = null
            } else {
              v.state = 'idle'
              v.workplaceId = null
              v.forageFieldId = null
              v.carryType = null
            }
          }
          break
        }
      }
    }

    // war parties, conversions & the village economy. Loot and tribute both feed
    // `gained`, so this must run BEFORE the resource apply.
    {
      const conquered: string[] = []
      const converted: string[] = []
      const dead = new Set<number>()
      const battles = get().battles

      // a war party that reached a (still-neutral) village starts a melee
      for (const vid of reached) {
        if (battles.some((b) => b.villageId === vid)) continue
        const village = get().npcVillages.find((x) => x.id === vid)
        if (!village || village.owner !== 'neutral') continue
        const party = villagers.filter(
          (x) => (x.state === 'marching' || x.state === 'fighting') && x.targetVillageId === vid,
        )
        if (!party.length) continue
        // outcome turns on troop count vs. the village's defenders AND its age
        const soldiers = party.length
        const strength = Math.ceil(village.villagers.length * (0.8 + village.tierIndex * 0.25))
        const win = soldiers > strength
        const casualties = Math.min(
          soldiers,
          win ? Math.floor(strength / 2) : Math.ceil(soldiers * 0.6),
        )
        const doomed = party.slice(0, casualties).map((sol) => ({
          id: sol.id,
          at: 0.8 + Math.random() * (BATTLE_DURATION - 1.4),
          dead: false,
        }))
        for (const sol of party) sol.state = 'fighting' // everyone engages
        battles.push({ villageId: vid, timer: 0, win, doomed })
        get().pushToast(`The battle for ${village.name} begins!`, 'info')
      }

      // run ongoing battles: soldiers fall one by one, then it resolves
      const finished: number[] = []
      for (const battle of battles) {
        battle.timer += dt
        for (const d of battle.doomed) {
          if (!d.dead && battle.timer >= d.at) {
            d.dead = true
            dead.add(d.id)
          }
        }
        if (battle.timer < BATTLE_DURATION) continue
        finished.push(battle.villageId)
        const village = get().npcVillages.find((x) => x.id === battle.villageId)
        if (village && village.owner === 'neutral' && battle.win) {
          village.owner = 'player'
          village.influence = 100
          for (const t of RESOURCE_TYPES) gained[t] += village.resources[t] // loot the stockpile
          conquered.push(village.name)
        }
        for (const x of villagers)
          if (x.state === 'fighting' && x.targetVillageId === battle.villageId) {
            x.state = 'idle' // survivors stand down and head home
            x.targetVillageId = null
          }
      }
      if (finished.length) set({ battles: battles.filter((b) => !finished.includes(b.villageId)) })

      // a fully-preached village converts to your faith
      for (const village of get().npcVillages) {
        if (village.owner === 'neutral' && village.influence >= 100) {
          village.owner = 'player'
          converted.push(village.name)
          for (const x of villagers)
            if (x.state === 'converting' && x.targetVillageId === village.id) {
              x.state = 'idle'
              x.targetVillageId = null
            }
        }
      }
      // village economy: yours pay tribute into your stockpile, neutrals fill their own
      for (const village of get().npcVillages) {
        if (village.owner === 'player') {
          for (const t of RESOURCE_TYPES) gained[t] += village.income[t] * dt
        } else {
          const npcCap = TOWN_TIERS[village.tierIndex].storageCap
          for (const t of RESOURCE_TYPES) {
            village.resources[t] = Math.min(npcCap, village.resources[t] + village.income[t] * dt)
          }
        }
      }
      if (conquered.length || converted.length) set({ npcVillages: [...get().npcVillages] })
      if (dead.size) set({ villagers: get().villagers.filter((x) => !dead.has(x.id)) })
      for (const name of conquered) get().pushToast(`${name} conquered — it joins your realm!`, 'good')
      for (const name of converted) get().pushToast(`${name} converted — it joins your realm!`, 'good')
    }

    // apply on ANY change — crafting buildings consume inputs (negative gains)
    // in ticks where nothing is yet deposited; a `> 0` guard would drop those.
    if (RESOURCE_TYPES.some((t) => gained[t] !== 0)) {
      const cap = TOWN_TIERS[get().tierIndex].storageCap
      set((s) => {
        const next = { ...s.resources }
        for (const t of RESOURCE_TYPES) next[t] = Math.max(0, Math.min(cap, next[t] + gained[t]))
        return { resources: next }
      })
      // celebrate the first delivery of each resource
      if (gained.wood > 0 && !get().firstWoodDelivered) {
        set({ firstWoodDelivered: true })
        get().pushToast('First wood delivered to the townhall!', 'good')
      }
      if (gained.food > 0 && !get().firstFoodDelivered) {
        set({ firstFoodDelivered: true })
        get().pushToast('First food gathered!', 'good')
      }
    }

    // a scout reached a new village — publish a fresh array ref so it renders,
    // and announce first contact
    if (discovered.length) {
      set({ npcVillages: [...get().npcVillages] })
      for (const name of discovered) get().pushToast(`Your scout discovered ${name}!`, 'good')
    }

    // wildlife: graze, and bring hunted animals back elsewhere after a while
    for (const an of get().animals) {
      if (an.alive) {
        animalGraze(an, dt)
      } else {
        an.respawnTimer -= dt
        if (an.respawnTimer <= 0) {
          const a = Math.random() * Math.PI * 2
          an.pos = { x: an.home.x + Math.cos(a) * 3, z: an.home.z + Math.sin(a) * 3 }
          an.wanderTarget = null
          an.alive = true
        }
      }
    }

    // NPC village inhabitants amble in place — or rush to defend during a battle
    for (const village of get().npcVillages) {
      const underAttack = get().battles.some((b) => b.villageId === village.id)
      const clash = underAttack ? clashPoint(village.center) : null
      for (const nv of village.villagers) {
        if (clash) {
          nv.heading = Math.atan2(clash.x - nv.pos.x, clash.z - nv.pos.z)
          if (dist(nv.pos, clash) > 2) moveToward(nv.pos, clash, ANIMAL_SPEED * 2.4 * dt)
        } else {
          npcWander(nv, village.center, village.territoryRadius, dt)
        }
      }
    }

    // advance the starter objectives (completes in order; cascades if ahead)
    let step = get().objectiveStep
    const start = step
    while (step < OBJECTIVES.length && OBJECTIVES[step].done(get())) step++
    if (step !== start) {
      set({ objectiveStep: step })
      for (let i = start; i < step; i++) get().pushToast('Done: ' + OBJECTIVES[i].title, 'good')
      if (step >= OBJECTIVES.length) get().pushToast('Your village is on its feet — keep growing!', 'good')
    }
  },

  upgradeTownCenter: () => {
    const { tierIndex } = get()
    const next = TOWN_TIERS[tierIndex + 1]
    if (!next || !next.upgradeCost) return
    if (!get().canAfford(next.upgradeCost)) {
      get().pushToast(`Need ${costText(next.upgradeCost)}`, 'warn')
      return
    }
    get().pushToast(`${next.name} raised — your borders expand!`, 'good')
    set((s) => ({
      resources: spend(s.resources, next.upgradeCost!),
      tierIndex: s.tierIndex + 1,
    }))
  },

  trainVillager: () => {
    const s = get()
    if (s.villagers.length >= s.popCap()) {
      s.pushToast('No housing — build a house first', 'warn')
      return
    }
    if (!s.canAfford(VILLAGER_COST)) {
      s.pushToast(`Need ${costText(VILLAGER_COST)}`, 'warn')
      return
    }
    const v = makeVillager(s.villagers.length)
    set((st) => ({
      resources: spend(st.resources, VILLAGER_COST),
      villagers: [...st.villagers, v],
    }))
  },

  // ---- building / editing ----
  setBuildMode: (mode) => set({ buildMode: mode, pathDraft: [], selection: null }),

  setCursorGround: (p) => {
    const c = get().cursorGround
    c.x = p.x
    c.z = p.z
  },

  setHover: (h) => set({ hover: h }),

  pushToast: (msg, kind = 'info') =>
    set((s) => ({ toasts: [...s.toasts, { id: nextToastId++, msg, kind }].slice(-4) })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  placeResidence: (p) => {
    const s = get()
    const era = RESIDENCE_ERAS[s.tierIndex]
    if (s.atBuildCap()) {
      s.pushToast('Build limit reached — upgrade the townhall for more', 'warn')
      return
    }
    if (!s.canAfford(era.buildCost)) {
      s.pushToast(`Need ${costText(era.buildCost)}`, 'warn')
      return
    }
    if (dist(p, TOWN_CENTER) > s.territoryRadius()) {
      s.pushToast('Outside your borders — upgrade the townhall to expand', 'warn')
      return
    }
    if (!s.canPlaceAt(p, RESIDENCE_HALF)) {
      s.pushToast('Can’t build there — too close to something', 'warn')
      return
    }
    const building: Building = {
      id: nextBuildingId++,
      kind: 'house',
      level: s.tierIndex,
      pos: { x: p.x, z: p.z },
      rot: Math.atan2(TOWN_CENTER.x - p.x, TOWN_CENTER.z - p.z),
      workers: [],
    }
    set((st) => ({
      resources: spend(st.resources, era.buildCost),
      buildings: [...st.buildings, building],
      buildMode: 'none', // one placement, then back to Select
    }))
  },

  upgradeResidence: (buildingId) => {
    const s = get()
    const b = s.buildings.find((x) => x.id === buildingId)
    if (!b || b.kind !== 'house' || b.level >= s.tierIndex) return
    const next = RESIDENCE_ERAS[b.level + 1]
    if (!next.upgradeCost || !s.canAfford(next.upgradeCost)) return
    set((st) => ({
      resources: spend(st.resources, next.upgradeCost!),
      buildings: st.buildings.map((x) => (x.id === buildingId ? { ...x, level: x.level + 1 } : x)),
    }))
  },

  placeProduction: (p, kind) => {
    const s = get()
    const def = PRODUCTION[kind]
    if (s.atBuildCap()) {
      s.pushToast('Build limit reached — upgrade the townhall for more', 'warn')
      return
    }
    if (!s.canAfford(def.cost)) {
      s.pushToast(`Need ${costText(def.cost)}`, 'warn')
      return
    }
    if (dist(p, TOWN_CENTER) > s.territoryRadius()) {
      s.pushToast('Outside your borders — upgrade the townhall to expand', 'warn')
      return
    }
    if (!s.canPlaceProduction(p, kind)) {
      if (!def.fieldType) {
        s.pushToast('Can’t build there — too close to something', 'warn')
        return
      }
      const onField = FIELDS.some(
        (f) => f.type === def.fieldType && dist(p, f.pos) <= f.radius + FIELD_BUILD_RANGE,
      )
      const needField: Record<FieldType, string> = {
        forest: 'Lumberyards must sit on a forest',
        berryfield: "Forager's Huts go on a berry field",
        rock: 'Quarries must sit on a rock outcrop',
        mithrildeposit: 'A Mine must sit on a mithril deposit',
      }
      s.pushToast(onField ? 'Too close to another building' : needField[def.fieldType], 'warn')
      return
    }
    const building: Building = {
      id: nextBuildingId++,
      kind,
      level: 0,
      pos: { x: p.x, z: p.z },
      rot: Math.atan2(TOWN_CENTER.x - p.x, TOWN_CENTER.z - p.z),
      workers: [],
    }
    set((st) => ({
      resources: spend(st.resources, def.cost),
      buildings: [...st.buildings, building],
      buildMode: 'none', // one placement, then back to Select
    }))
  },

  // send the nearest idle villager to work at a production building
  staffBuilding: (buildingId) => {
    const s = get()
    const b = s.buildings.find((x) => x.id === buildingId)
    const lvl = b ? prodLevel(b) : null
    if (!b || !lvl) return
    if (b.workers.length >= lvl.slots) {
      s.pushToast('Workplace is full — upgrade for more workers', 'warn')
      return
    }
    let best: Villager | null = null
    let bestD = Infinity
    for (const v of s.villagers) {
      if (v.state === 'idle' && v.workplaceId === null) {
        const d = dist(v.pos, b.pos)
        if (d < bestD) {
          bestD = d
          best = v
        }
      }
    }
    if (!best) {
      s.pushToast('No idle villagers — pick one off another job or train more', 'warn')
      return
    }
    best.workplaceId = buildingId
    best.state = 'toWork'
    best.route = null
    const id = best.id
    set((st) => ({
      buildings: st.buildings.map((x) =>
        x.id === buildingId ? { ...x, workers: [...x.workers, id] } : x,
      ),
    }))
  },

  // upgrade a production building one level (gated by town tier + cost)
  upgradeProduction: (buildingId) => {
    const s = get()
    const b = s.buildings.find((x) => x.id === buildingId)
    if (!b || !isProduction(b)) return
    const levels = PRODUCTION[b.kind].levels
    const next = levels[b.level + 1]
    if (!next) {
      s.pushToast('Already at the highest level', 'warn')
      return
    }
    if (s.tierIndex < next.reqTier) {
      s.pushToast(`Unlocks at ${TOWN_TIERS[next.reqTier].era}`, 'warn')
      return
    }
    if (!next.upgradeCost || !s.canAfford(next.upgradeCost)) {
      s.pushToast(`Need ${costText(next.upgradeCost ?? {})}`, 'warn')
      return
    }
    s.pushToast(`Upgraded to ${next.name}`, 'good')
    set((st) => ({
      resources: spend(st.resources, next.upgradeCost!),
      buildings: st.buildings.map((x) => (x.id === buildingId ? { ...x, level: x.level + 1 } : x)),
    }))
  },

  // send the nearest idle villager to gather a field by hand (slow, no building)
  gatherField: (fieldId) => {
    const s = get()
    const f = FIELDS.find((x) => x.id === fieldId)
    if (!f) return
    let best: Villager | null = null
    let bestD = Infinity
    for (const v of s.villagers) {
      if (v.state === 'idle' && v.workplaceId === null && v.forageFieldId === null) {
        const d = dist(v.pos, f.pos)
        if (d < bestD) {
          bestD = d
          best = v
        }
      }
    }
    if (!best) {
      s.pushToast('No idle villagers to send', 'warn')
      return
    }
    best.forageFieldId = fieldId
    best.state = 'toWork'
    best.route = null
  },

  sendScoutTo: (p) => {
    const s = get()
    // nearest idle villager becomes the scout
    let scout: Villager | null = null
    let scoutD = Infinity
    for (const v of s.villagers) {
      if (v.state === 'idle' && v.workplaceId === null && v.forageFieldId === null) {
        const d = dist(v.pos, TOWN_CENTER)
        if (d < scoutD) {
          scoutD = d
          scout = v
        }
      }
    }
    if (!scout) {
      s.pushToast('No idle villager free to scout', 'warn')
      return
    }
    scout.state = 'scouting'
    scout.scoutTarget = { x: p.x, z: p.z }
    scout.scoutReturning = false
    scout.route = null
    scout.wanderTarget = null
    s.pushToast('A scout sets out to explore…', 'info')
  },

  attackVillage: (villageId) => {
    const s = get()
    const village = s.npcVillages.find((v) => v.id === villageId)
    if (!village || !village.discovered || village.owner !== 'neutral') return
    const idle = s.villagers.filter(
      (v) => v.state === 'idle' && v.workplaceId === null && v.forageFieldId === null,
    )
    const party = Math.min(idle.length, Math.floor(s.resources.weapons), MAX_PARTY)
    if (party < 1) {
      s.pushToast('Need idle villagers and weapons to muster a war party', 'warn')
      return
    }
    // arm the war party (each soldier spends a weapon) and march
    set((st) => ({ resources: { ...st.resources, weapons: st.resources.weapons - party } }))
    idle
      .sort((a, b) => dist(a.pos, village.center) - dist(b.pos, village.center))
      .slice(0, party)
      .forEach((sol) => {
        sol.state = 'marching'
        sol.targetVillageId = villageId
        sol.route = null
        sol.wanderTarget = null
      })
    s.pushToast(`${party} soldiers march on ${village.name}!`, 'info')
  },

  sendMissionary: (villageId) => {
    const s = get()
    const village = s.npcVillages.find((v) => v.id === villageId)
    if (!village || !village.discovered || village.owner !== 'neutral') return
    let best: Villager | null = null
    let bestD = Infinity
    for (const v of s.villagers) {
      if (v.state === 'idle' && v.workplaceId === null && v.forageFieldId === null) {
        const d = dist(v.pos, TOWN_CENTER)
        if (d < bestD) {
          bestD = d
          best = v
        }
      }
    }
    if (!best) {
      s.pushToast('No idle villager free to send', 'warn')
      return
    }
    best.state = 'converting'
    best.targetVillageId = villageId
    best.route = null
    best.wanderTarget = null
    s.pushToast(`A missionary sets out to ${village.name}…`, 'info')
  },

  // ---- selection (for the management panel) ----
  selectBuilding: (id) => set({ selection: { kind: 'building', id } }),
  selectTownhall: () => set({ selection: { kind: 'townhall' } }),
  selectNpc: (id) => set({ selection: { kind: 'npc', id } }),
  clearSelection: () => set({ selection: null }),

  addPathPoint: (p) => {
    const snap = snapPathPoint(p, get().buildings)
    const point = snap.point
    const draft = get().pathDraft
    if (draft.length === 0) {
      set({ pathDraft: [point] })
      return
    }
    const a = draft[draft.length - 1]
    if (dist(a, point) < 0.6) return
    const seg: PathSegment = { id: nextPathId++, a: { ...a }, b: point, level: 0 }
    set((st) => ({ paths: [...st.paths, seg], pathDraft: [...st.pathDraft, point] }))
    // a road that reaches a key spot (snapped to the townhall / a building) is
    // complete — finish it and drop back to Select
    if (snap.target) set({ buildMode: 'none', pathDraft: [], selection: null })
  },

  endPath: () => set({ pathDraft: [] }),

  // ---- hand of god ----
  pickUpVillager: (villagerId) => {
    const v = get().villagers.find((x) => x.id === villagerId)
    if (!v) return
    const wid = v.workplaceId
    v.workplaceId = null
    v.forageFieldId = null
    v.carry = 0
    v.carryType = null
    v.route = null
    v.scoutTarget = null
    v.scoutReturning = false
    v.huntAnimalId = null
    v.targetVillageId = null
    v.state = 'held'
    set((st) => ({
      heldId: villagerId,
      buildings:
        wid != null
          ? st.buildings.map((b) =>
              b.id === wid ? { ...b, workers: b.workers.filter((x) => x !== villagerId) } : b,
            )
          : st.buildings,
    }))
  },

  moveHeld: (p) => {
    const id = get().heldId
    if (id == null) return
    const v = get().villagers.find((x) => x.id === id)
    if (!v) return
    v.pos.x = p.x
    v.pos.z = p.z
  },

  dropHeld: () => {
    const id = get().heldId
    if (id == null) return
    const v = get().villagers.find((x) => x.id === id)
    if (!v) {
      set({ heldId: null })
      return
    }
    // dropped onto a production building with a free slot? -> hire them there
    const target = get().buildings.find((b) => {
      const lvl = prodLevel(b)
      return lvl != null && b.workers.length < lvl.slots && dist(v.pos, b.pos) < buildingHalf(b) + 1.1
    })
    // dropped onto a forest / berry field? -> gather it by hand (slow)
    const field = target ? null : FIELDS.find((f) => dist(v.pos, f.pos) <= f.radius + 0.6)
    if (target) {
      v.state = 'toWork'
      v.workplaceId = target.id
      v.route = null
      const vid = v.id
      set((st) => ({
        heldId: null,
        buildings: st.buildings.map((b) =>
          b.id === target.id ? { ...b, workers: [...b.workers, vid] } : b,
        ),
      }))
    } else if (field) {
      v.state = 'toWork'
      v.forageFieldId = field.id
      v.route = null
      set({ heldId: null })
    } else {
      // open ground -> go idle (they'll amble back toward the townhall)
      v.state = 'idle'
      v.wanderTarget = null
      set({ heldId: null })
    }
  },

  // ---- persistence ----
  saveGame: () => writeSave(toSave(get())),

  resetGame: () => {
    clearSave()
    set({
      ...freshState(),
      animals: makeAnimals(),
      battles: [],
      buildMode: 'none',
      pathDraft: [],
      cursorGround: { x: 0, z: 0 },
      heldId: null,
      hover: null,
      selection: null,
      toasts: [],
    })
  },

  // ---- debug: jump to a representative base for an era ----
  debugSetupEra: (tier) => {
    const t = Math.max(0, Math.min(TOWN_TIERS.length - 1, Math.floor(tier)))
    nextVillagerId = 1
    nextBuildingId = 1
    nextPathId = 1

    const buildings: Building[] = []
    const paths: PathSegment[] = []

    // highest production level whose town-tier requirement this era satisfies
    const maxLevelFor = (def: ProductionDef) => {
      let lvl = 0
      for (let i = 0; i < def.levels.length; i++) if (def.levels[i].reqTier <= t) lvl = i
      return lvl
    }
    const addProd = (kind: ProductionKind, field: ResourceField) => {
      const pos = { x: field.pos.x, z: field.pos.z }
      const b: Building = {
        id: nextBuildingId++,
        kind,
        level: maxLevelFor(PRODUCTION[kind]),
        pos,
        rot: Math.atan2(TOWN_CENTER.x - pos.x, TOWN_CENTER.z - pos.z),
        workers: [],
      }
      buildings.push(b)
      // a road back to the townhall (snapped exactly to both ends)
      paths.push({ id: nextPathId++, a: { ...pos }, b: { ...TOWN_CENTER }, level: 0 })
      return b
    }

    const forest = FIELDS.find((f) => f.type === 'forest')
    const berry = FIELDS.find((f) => f.type === 'berryfield')
    const rock = FIELDS.find((f) => f.type === 'rock')
    const oreDep = FIELDS.find((f) => f.type === 'mithrildeposit')
    if (forest) addProd('lumberyard', forest)
    if (berry) addProd('forager', berry)
    if (t >= 2 && rock) addProd('quarry', rock) // stone matters from the Mithril Age on
    if (t >= 2 && oreDep) addProd('mine', oreDep)
    if (t >= 3) {
      const pos = { x: -9, z: 6 } // smithy on open ground (Iron Age)
      buildings.push({
        id: nextBuildingId++,
        kind: 'smithy',
        level: maxLevelFor(PRODUCTION.smithy),
        pos,
        rot: Math.atan2(TOWN_CENTER.x - pos.x, TOWN_CENTER.z - pos.z),
        workers: [],
      })
      paths.push({ id: nextPathId++, a: { ...pos }, b: { ...TOWN_CENTER }, level: 0 })
    }

    // houses ring the townhall, count scaling with the era
    const houseCount = 1 + t
    for (let i = 0; i < houseCount; i++) {
      const a = (i / houseCount) * Math.PI * 2 + 0.6
      const pos = { x: Math.cos(a) * 6, z: Math.sin(a) * 6 }
      buildings.push({
        id: nextBuildingId++,
        kind: 'house',
        level: t,
        pos,
        rot: Math.atan2(TOWN_CENTER.x - pos.x, TOWN_CENTER.z - pos.z),
        workers: [],
      })
    }

    // fill population to the cap, staff the workplaces, leave a couple idle
    const popCap = TOWN_TIERS[t].popCap + residencePop(buildings)
    const villagers: Villager[] = []
    for (let i = 0; i < popCap; i++) villagers.push(makeVillager(i))
    let vi = 0
    for (const b of buildings) {
      if (!isProduction(b)) continue
      const levels = PRODUCTION[b.kind].levels
      const lvl = levels[Math.min(b.level, levels.length - 1)]
      for (let slot = 0; slot < lvl.slots && vi < villagers.length - 1; slot++) {
        const v = villagers[vi++]
        v.workplaceId = b.id
        v.state = 'toWork'
        b.workers.push(v.id)
      }
    }

    const cap = TOWN_TIERS[t].storageCap
    set({
      tierIndex: t,
      resources: {
        wood: Math.floor(cap * 0.6),
        food: Math.floor(cap * 0.5),
        stone: t >= 2 ? Math.floor(cap * 0.4) : 0,
        mithril: t >= 2 ? Math.floor(cap * 0.3) : 0,
        weapons: t >= 3 ? Math.floor(cap * 0.15) : 0,
      },
      villagers,
      buildings,
      paths,
      objectiveStep: OBJECTIVES.length,
      firstWoodDelivered: true,
      firstFoodDelivered: true,
      buildMode: 'none',
      pathDraft: [],
      heldId: null,
      selection: null,
    })
    get().pushToast(`Debug: jumped to the ${TOWN_TIERS[t].era}`, 'info')
  },

  debugDiscoverAll: () =>
    set((s) => ({ npcVillages: s.npcVillages.map((v) => ({ ...v, discovered: true })) })),
}))

// dev-only handle for debugging / driving the sim from the console
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as { __game: typeof useGame; __roadConnected: typeof roadConnected }
  w.__game = useGame
  w.__roadConnected = roadConnected
}
