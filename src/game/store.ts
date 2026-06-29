import { create } from 'zustand'
import type {
  Building,
  BuildMode,
  PathSegment,
  ProductionDef,
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
  RESIDENCE_ERAS,
  RESIDENCE_HALF,
  ROAD_INFLUENCE,
  ROAD_SPEED,
  TOWN_CLEAR_RADIUS,
  TOWN_TIERS,
  VILLAGER_COST,
  WALK_SPEED,
  WANDER_INNER,
  WANDER_OUTER,
  WORK_STANDOFF,
} from './config'
import { FIELDS } from './fields'

/** total population added by residences (houses only), each at its era capacity */
export function residencePop(buildings: Building[]): number {
  return buildings
    .filter((b) => b.kind === 'house')
    .reduce((sum, b) => sum + (RESIDENCE_ERAS[b.level]?.popBonus ?? 0), 0)
}

export function isProduction(b: Building): b is Building & { kind: 'lumberyard' | 'forager' } {
  return b.kind === 'lumberyard' || b.kind === 'forager'
}

/** which resource a natural field yields when gathered */
function fieldResource(f: ResourceField): ResourceType {
  return f.type === 'forest' ? 'wood' : 'food'
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
    bob: index * 1.7,
  }
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
  territoryRadius: () => number
  canAfford: (cost: Partial<Resources>) => boolean
  canPlaceAt: (p: Vec2, half: number) => boolean
  canPlaceProduction: (p: Vec2, kind: 'lumberyard' | 'forager') => boolean

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
  placeProduction: (p: Vec2, kind: 'lumberyard' | 'forager') => void
  staffBuilding: (buildingId: number) => void
  upgradeProduction: (buildingId: number) => void
  gatherField: (fieldId: number) => void
  addPathPoint: (p: Vec2) => void
  endPath: () => void

  // selection
  selectBuilding: (id: number) => void
  selectTownhall: () => void
  clearSelection: () => void

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
]

export const useGame = create<GameState>((set, get) => ({
  // start poor: not enough to build a lumberyard or upgrade the townhall —
  // you must chop the lone starter trees first.
  resources: { wood: 5, food: 20 },
  villagers: [makeVillager(0), makeVillager(1), makeVillager(2)],
  tierIndex: 0,

  buildings: [],
  paths: [],
  buildMode: 'none',
  pathDraft: [],
  cursorGround: { x: 0, z: 0 },
  heldId: null,
  hover: null,
  objectiveStep: 0,
  toasts: [],
  firstWoodDelivered: false,
  firstFoodDelivered: false,
  selection: null,

  popCap: () => {
    const s = get()
    return TOWN_TIERS[s.tierIndex].popCap + residencePop(s.buildings)
  },

  storageCap: () => TOWN_TIERS[get().tierIndex].storageCap,
  territoryRadius: () => TOWN_TIERS[get().tierIndex].territoryRadius,

  canAfford: (cost) => {
    const r = get().resources
    return (cost.wood ?? 0) <= r.wood && (cost.food ?? 0) <= r.food
  },

  canPlaceAt: (p, half) => {
    if (dist(p, TOWN_CENTER) > get().territoryRadius()) return false // outside your borders
    if (dist(p, TOWN_CENTER) < TOWN_CLEAR_RADIUS + half) return false
    for (const b of get().buildings) {
      if (dist(p, b.pos) < buildingHalf(b) + half + 0.4) return false
    }
    return true
  },

  // production buildings must sit on a matching natural field
  canPlaceProduction: (p, kind) => {
    const def = PRODUCTION[kind]
    if (!get().canPlaceAt(p, def.half)) return false
    return FIELDS.some(
      (f) => f.type === def.fieldType && dist(p, f.pos) <= f.radius + FIELD_BUILD_RANGE,
    )
  },

  tick: (dt) => {
    const { villagers, buildings, paths, resources } = get()
    const cap = TOWN_TIERS[get().tierIndex].storageCap
    let gainedWood = 0
    let gainedFood = 0

    // a worker's resource is "full" once the live stockpile (incl. this tick's
    // deliveries so far) hits the cap — those workers loiter instead of working.
    const isFull = (type: 'wood' | 'food') =>
      (type === 'wood' ? resources.wood + gainedWood : resources.food + gainedFood) >= cap

    for (const v of villagers) {
      switch (v.state) {
        case 'idle': {
          wanderAroundTown(v, dt)
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
            faceToward(v, b.pos)
            v.workTimer += dt
            if (v.workTimer >= lvl.workTime) {
              v.carry = lvl.load
              v.carryType = def.produces
              v.state = 'hauling'
              v.route = null
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

        case 'hauling': {
          if (v.route === null) beginTrip(v, TOWN_CENTER, paths)
          // deposit on arrival within DEPOSIT_RADIUS; the road-exit cut keeps the
          // worker from overshooting the base when a path is drawn past it
          if (advanceRoute(v, paths, dt, ROAD_EXIT, DEPOSIT_RADIUS)) {
            if (v.carry > 0 && v.carryType === 'wood') gainedWood += v.carry
            else if (v.carry > 0 && v.carryType === 'food') gainedFood += v.carry
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

    if (gainedWood || gainedFood) {
      const cap = TOWN_TIERS[get().tierIndex].storageCap
      set((s) => ({
        resources: {
          wood: Math.min(cap, s.resources.wood + gainedWood),
          food: Math.min(cap, s.resources.food + gainedFood),
        },
      }))
      // celebrate the first delivery of each resource
      if (gainedWood > 0 && !get().firstWoodDelivered) {
        set({ firstWoodDelivered: true })
        get().pushToast('First wood delivered to the townhall!', 'good')
      }
      if (gainedFood > 0 && !get().firstFoodDelivered) {
        set({ firstFoodDelivered: true })
        get().pushToast('First food gathered!', 'good')
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
      get().pushToast(`Need ${next.upgradeCost.wood} wood & ${next.upgradeCost.food} food`, 'warn')
      return
    }
    get().pushToast(`${next.name} raised — your borders expand!`, 'good')
    set((s) => ({
      resources: {
        wood: s.resources.wood - (next.upgradeCost!.wood ?? 0),
        food: s.resources.food - (next.upgradeCost!.food ?? 0),
      },
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
      s.pushToast(`Need ${VILLAGER_COST.food} food`, 'warn')
      return
    }
    const v = makeVillager(s.villagers.length)
    set((st) => ({
      resources: {
        wood: st.resources.wood - VILLAGER_COST.wood,
        food: st.resources.food - VILLAGER_COST.food,
      },
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
    if (!s.canAfford(era.buildCost)) {
      s.pushToast(`Need ${era.buildCost.wood} wood`, 'warn')
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
      resources: {
        wood: st.resources.wood - era.buildCost.wood,
        food: st.resources.food - era.buildCost.food,
      },
      buildings: [...st.buildings, building],
    }))
  },

  upgradeResidence: (buildingId) => {
    const s = get()
    const b = s.buildings.find((x) => x.id === buildingId)
    if (!b || b.kind !== 'house' || b.level >= s.tierIndex) return
    const next = RESIDENCE_ERAS[b.level + 1]
    if (!next.upgradeCost || !s.canAfford(next.upgradeCost)) return
    set((st) => ({
      resources: {
        wood: st.resources.wood - next.upgradeCost!.wood,
        food: st.resources.food - next.upgradeCost!.food,
      },
      buildings: st.buildings.map((x) => (x.id === buildingId ? { ...x, level: x.level + 1 } : x)),
    }))
  },

  placeProduction: (p, kind) => {
    const s = get()
    const def = PRODUCTION[kind]
    if (!s.canAfford(def.cost)) {
      s.pushToast(`Need ${def.cost.wood} wood`, 'warn')
      return
    }
    if (dist(p, TOWN_CENTER) > s.territoryRadius()) {
      s.pushToast('Outside your borders — upgrade the townhall to expand', 'warn')
      return
    }
    if (!s.canPlaceProduction(p, kind)) {
      const onField = FIELDS.some(
        (f) => f.type === def.fieldType && dist(p, f.pos) <= f.radius + FIELD_BUILD_RANGE,
      )
      s.pushToast(
        onField
          ? 'Too close to another building'
          : def.fieldType === 'forest'
            ? 'Lumberyards must sit on a forest'
            : "Forager's Huts go on a berry field",
        'warn',
      )
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
      resources: {
        wood: st.resources.wood - def.cost.wood,
        food: st.resources.food - def.cost.food,
      },
      buildings: [...st.buildings, building],
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
      s.pushToast(
        `Need ${next.upgradeCost?.wood ?? 0} wood${next.upgradeCost?.food ? ` & ${next.upgradeCost.food} food` : ''}`,
        'warn',
      )
      return
    }
    s.pushToast(`Upgraded to ${next.name}`, 'good')
    set((st) => ({
      resources: {
        wood: st.resources.wood - next.upgradeCost!.wood,
        food: st.resources.food - next.upgradeCost!.food,
      },
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

  // ---- selection (for the management panel) ----
  selectBuilding: (id) => set({ selection: { kind: 'building', id } }),
  selectTownhall: () => set({ selection: { kind: 'townhall' } }),
  clearSelection: () => set({ selection: null }),

  addPathPoint: (p) => {
    const draft = get().pathDraft
    const point = snapPathPoint(p, get().buildings).point
    if (draft.length === 0) {
      set({ pathDraft: [point] })
      return
    }
    const a = draft[draft.length - 1]
    if (dist(a, point) < 0.6) return
    const seg: PathSegment = { id: nextPathId++, a: { ...a }, b: point, level: 0 }
    set((st) => ({ paths: [...st.paths, seg], pathDraft: [...st.pathDraft, point] }))
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
}))

// dev-only handle for debugging / driving the sim from the console
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as { __game: typeof useGame; __roadConnected: typeof roadConnected }
  w.__game = useGame
  w.__roadConnected = roadConnected
}
