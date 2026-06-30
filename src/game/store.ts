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
  Endgame,
  ProductionDef,
  ProductionKind,
  Raid,
  Refounding,
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
  CHOP_REACH,
  DEER_HP,
  HUNT_FOOD,
  PICK_FOOD,
  TREE_HP,
  TREE_WOOD,
  CONVERT_RADIUS,
  CONVERT_RATE,
  DEFEND_RALLY,
  ENGAGE_RADIUS,
  EXPANSION_TIER,
  MARCH_SPEED,
  MAX_PARTY,
  MEDIEVAL_TIER,
  METEOR_ANGLE,
  METEOR_DIST,
  METEOR_FOUND_RADIUS,
  MITHRIL_TIER,
  PILLAGE_FRACTION,
  RAID_CHECK_INTERVAL,
  RAID_COOLDOWN,
  RAID_HOME_ADVANTAGE,
  RAID_MIN_PARTY,
  REFOUND_FOOD_GOAL,
  REFOUND_TRIGGER_POP,
  REFOUND_WOOD_GOAL,
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
  SETTLE_COST,
  SETTLE_MAX_RANGE,
  SETTLE_MIN_DIST,
  SETTLER_SPEED,
  TOWN_CLEAR_RADIUS,
  VILLAGE_CLEAR_RADIUS,
  TOWN_TIERS,
  VILLAGER_COST,
  WALK_SPEED,
  WANDER_INNER,
  WANDER_OUTER,
  WORK_STANDOFF,
} from './config'
import { FIELDS, FIELD_CLUMPS } from './fields'
import { SCENERY } from './scenery'
import { makeNpcVillages, villageIncome } from './npc'
import { makeAnimals } from './animals'
import { clearSave, readSave, writeSave, SAVE_VERSION, type SaveData } from './save'

// ---- resource bookkeeping (generic over ResourceType so adding a resource is
// a config change, not new logic) -------------------------------------------
export const RESOURCE_TYPES: ResourceType[] = [
  'wood',
  'food',
  'stone',
  'mithril',
  'orichalcum',
  'starmetal',
  'weapons',
]

/** a zeroed stockpile */
function emptyResources(): Resources {
  return { wood: 0, food: 0, stone: 0, mithril: 0, orichalcum: 0, starmetal: 0, weapons: 0 }
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
  'orichalcummine',
  'smithy',
  'starforge',
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
    case 'orichalcumdeposit':
      return 'orichalcum'
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

/** materials handed back when you demolish — half of what an equivalent building
 * (at its current level) would cost to put up now */
export function demolishRefund(b: Building): Cost {
  const recon = emptyResources()
  if (isProduction(b)) {
    const def = PRODUCTION[b.kind]
    for (const t of RESOURCE_TYPES) recon[t] += def.cost[t] ?? 0
    for (let lvl = 1; lvl <= b.level; lvl++) {
      const up = def.levels[lvl]?.upgradeCost
      if (up) for (const t of RESOURCE_TYPES) recon[t] += up[t] ?? 0
    }
  } else {
    const era = RESIDENCE_ERAS[b.level]
    for (const t of RESOURCE_TYPES) recon[t] += era?.buildCost[t] ?? 0
  }
  const refund: Cost = {}
  for (const t of RESOURCE_TYPES) {
    const half = Math.floor(recon[t] * 0.5)
    if (half > 0) refund[t] = half
  }
  return refund
}

// The capital's location. Starts at the world origin, but after a capital is
// destroyed and refounded it MOVES to wherever the survivor rebuilds. It's a
// shared mutable object so everything that reads TOWN_CENTER.x/.z (territory,
// hauling, wandering, placement) tracks the move with no extra plumbing.
export const TOWN_CENTER: Vec2 = { x: 0, z: 0 }

// Every choppable tree in the world: the forest clumps PLUS the scattered
// scenery trees. In first-person refounding each takes a few axe swings, then
// it's felled (added to choppedTrees) and yields wood. Ids are namespaced so
// each renderer (Fields for forests `${fieldId}:${i}`, Scenery for solo `s${i}`)
// can hide its own felled trees.
export const CHOP_TREES: { id: string; pos: Vec2 }[] = [
  ...FIELDS.filter((f) => f.type === 'forest').flatMap((f) =>
    (FIELD_CLUMPS[f.id] ?? []).map((c, i) => ({ id: `${f.id}:${i}`, pos: { x: c.x, z: c.z } })),
  ),
  ...SCENERY.trees.map((t, i) => ({ id: `s${i}`, pos: { x: t.x, z: t.z } })),
]

let nextVillagerId = 1
let nextBuildingId = 1
let nextPathId = 1
let nextToastId = 1
let nextNpcVillagerId = 1
let nextNpcVillageId = 1

// names given to settlements you found yourself, out in the wilderness
const SETTLEMENT_NAMES = [
  'Newhaven',
  'Farreach',
  'Highmoor',
  'Greyford',
  'Westmark',
  'Thornhold',
  'Oakhollow',
  'Riverend',
]

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

/** how close a click must be to a road segment to erase it */
export const ERASE_RANGE = 2.6

/** distance from point p to segment a-b */
export function pointSegDist(p: Vec2, a: Vec2, b: Vec2): number {
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

/** does a road connect this spot to a hub? (used for the "no road" cue; the hub
 * defaults to the townhall but is the nearest owned-village depot for outposts) */
export function roadConnected(pos: Vec2, paths: PathSegment[], target: Vec2 = TOWN_CENTER): boolean {
  return roadRouteTo(pos, target, paths) !== null
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
  // weapons AND orichalcum (the better metal) both arrive with the Age of Expansion
  if (type === 'weapons' || type === 'orichalcum') return tierIndex >= EXPANSION_TIER
  if (type === 'starmetal') return false // shown only once the meteor's Starforge opens
  return tierIndex >= MITHRIL_TIER // mithril arrives with the Mithril Age
}

// While drawing a path, a point this close to a key spot snaps onto it — so
// roads reliably *connect* instead of landing just short of, or past, what
// they're meant to join. Individual buildings need a precise click; settlement
// cores (capital + owned villages) are big landmarks, so they snap from much
// further out — clicking anywhere on/near a distant village hub joins the road.
const PATH_SNAP = 2.6
const HUB_SNAP = 8

/**
 * Snap a path point to the nearest key spot — a settlement core (within
 * HUB_SNAP) or a building (within PATH_SNAP) — else leave it where it is.
 * `target` is the snapped-to spot (for a placement cue), or null if none.
 */
export function snapPathPoint(
  p: Vec2,
  buildings: Building[],
  hubs: Vec2[] = [],
): { point: Vec2; target: Vec2 | null } {
  let best: Vec2 | null = null
  let bestD = Infinity
  // settlement cores (townhalls) take PRIORITY: a road near a village joins its
  // townhall, not a building (e.g. a mine) that happens to sit near the centre.
  // Wide snap, so a far/imprecise click still connects to the hub.
  for (const q of [TOWN_CENTER, ...hubs]) {
    const d = dist(p, q)
    if (d < HUB_SNAP && d < bestD) {
      bestD = d
      best = q
    }
  }
  // only snap to an individual building when you're NOT near any townhall
  if (!best) {
    for (const b of buildings) {
      const d = dist(p, b.pos)
      if (d < PATH_SNAP && d < bestD) {
        bestD = d
        best = b.pos
      }
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

// spawn position: a small ring around the campfire (wherever the capital is)
function spawnSpot(index: number): Vec2 {
  const a = (index / 6) * Math.PI * 2
  const r = 1.7
  return { x: TOWN_CENTER.x + Math.cos(a) * r, z: TOWN_CENTER.z + Math.sin(a) * r }
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
    defendTarget: null,
    bob: index * 1.7,
  }
}

/** the next id for a freshly-spawned NPC villager (e.g. raiders re-garrisoning a retaken town) */
function nextNpcVid(): number {
  return nextNpcVillagerId++
}

// a captured village's inhabitants join your realm: each NPC villager becomes a
// real, commandable villager standing where it was (it garrisons there, since
// idle villagers loiter around their nearest hub — see nearestHub)
function recruitFrom(village: NpcVillage): Villager[] {
  const out = village.villagers.map((nv) => {
    const pv = makeVillager(0)
    pv.pos = { x: nv.pos.x, z: nv.pos.z }
    pv.heading = nv.heading
    pv.bob = nv.bob
    pv.wanderTarget = null
    return pv
  })
  village.villagers = [] // they've left the AI village and joined you
  return out
}

// a brand-new settlement founded in the wilderness — a player-owned hub from
// scratch. It reuses the whole owned-village system (territory, haul depot,
// pop/build cap, upgrades); its economy is whatever you build there.
function makeFoundedSettlement(center: Vec2, id: number): NpcVillage {
  const tier = 1
  const model = RESIDENCE_ERAS[tier].model
  const huts: NpcVillage['huts'] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5
    const rad = 2.8 + (i % 2) * 1.2
    const hx = center.x + Math.cos(a) * rad
    const hz = center.z + Math.sin(a) * rad
    huts.push({ pos: { x: hx, z: hz }, rot: Math.atan2(center.x - hx, center.z - hz), model })
  }
  return {
    id,
    name: SETTLEMENT_NAMES[(((id - 3) % SETTLEMENT_NAMES.length) + SETTLEMENT_NAMES.length) % SETTLEMENT_NAMES.length],
    discovered: true,
    owner: 'player',
    influence: 100,
    center: { x: center.x, z: center.z },
    tierIndex: tier,
    territoryRadius: TOWN_TIERS[tier].territoryRadius * 0.6,
    resources: emptyResources(),
    income: emptyResources(), // founded from scratch — you build its economy yourself
    huts,
    villagers: [],
  }
}

// a neutral village musters a raiding party against your NEAREST settlement
// (capital or an owned outpost); your idle villagers nearby rally to defend.
function startRaid(from: NpcVillage) {
  const settlements: { center: Vec2; villageId: number | null }[] = [
    { center: TOWN_CENTER, villageId: null },
    ...useGame
      .getState()
      .npcVillages.filter((v) => v.owner === 'player')
      .map((v) => ({ center: v.center, villageId: v.id as number | null })),
  ]
  let tgt = settlements[0]
  let tgtD = dist(from.center, tgt.center)
  for (const sset of settlements) {
    const d = dist(from.center, sset.center)
    if (d < tgtD) (tgtD = d), (tgt = sset)
  }
  const party = from.villagers.slice(0, Math.max(1, from.villagers.length - 1))
  const clash = approachSpot(tgt.center, from.center, 5)
  for (const nv of party) nv.target = { x: clash.x, z: clash.z }
  // rally idle villagers near the threatened settlement to the clash line
  for (const v of useGame.getState().villagers) {
    if (
      v.state === 'idle' &&
      v.workplaceId === null &&
      v.forageFieldId === null &&
      dist(v.pos, tgt.center) <= DEFEND_RALLY
    ) {
      v.state = 'defending'
      v.defendTarget = { x: clash.x, z: clash.z }
      v.wanderTarget = null
    }
  }
  const raid: Raid = {
    fromVillageId: from.id,
    target: { x: tgt.center.x, z: tgt.center.z },
    targetVillageId: tgt.villageId,
    clash,
    phase: 'march',
    timer: 0,
    defenderWins: false,
    raiderIds: party.map((nv) => nv.id),
    doomedRaiders: [],
    doomedDefenders: [],
  }
  useGame.getState().raidCooldowns[from.id] = RAID_COOLDOWN
  useGame.setState({ raids: [...useGame.getState().raids, raid] })
  const where =
    tgt.villageId == null
      ? 'your capital'
      : useGame.getState().npcVillages.find((v) => v.id === tgt.villageId)?.name ?? 'your town'
  useGame
    .getState()
    .pushToast(`${from.name} is raiding ${where}! Rally idle people nearby to defend.`, 'warn')
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

// Your townhall plus every village that has joined you. Each is both a drop-off
// depot (workers haul to the nearest one) and an idle-loiter anchor (off-duty
// villagers amble around the nearest one) — so a captured village becomes a real
// forward base instead of a ~90-unit round-trip back home.
export function nearestHub(p: Vec2, npcVillages: NpcVillage[], extra?: Vec2 | null): Vec2 {
  let best = TOWN_CENTER
  let bestD = dist(p, TOWN_CENTER)
  for (const v of npcVillages) {
    if (v.owner !== 'player') continue
    const d = dist(p, v.center)
    if (d < bestD) {
      bestD = d
      best = v.center
    }
  }
  // the opened meteor's Starforge stockpiles locally, so its smiths don't trek
  // the whole continent back home with every bar of Starmetal
  if (extra) {
    const d = dist(p, extra)
    if (d < bestD) best = extra
  }
  return best
}

// a loiter point in the ring around a hub, near the villager's current angle so
// they circle it rather than cutting straight across it
function hubWanderSpot(from: Vec2, center: Vec2): Vec2 {
  const cur = Math.atan2(from.z - center.z, from.x - center.x)
  const a = cur + (Math.random() - 0.5) * 1.7
  const r = WANDER_INNER + Math.random() * (WANDER_OUTER - WANDER_INNER)
  return { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r }
}

// gently amble between spots around the nearest hub (townhall / owned village),
// pausing on arrival
function wanderAroundHub(v: Villager, npcVillages: NpcVillage[], dt: number) {
  if (v.wanderTarget && dist(v.pos, v.wanderTarget) > 0.3) {
    faceToward(v, v.wanderTarget)
    moveToward(v.pos, v.wanderTarget, WALK_SPEED * 0.42 * dt)
  } else {
    v.workTimer += dt
    if (!v.wanderTarget || v.workTimer >= IDLE_PAUSE) {
      v.wanderTarget = hubWanderSpot(v.pos, nearestHub(v.pos, npcVillages))
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
  /** simulation speed multiplier — 1×/2×/4× (transient; the tick substeps by it) */
  gameSpeed: number
  /** incoming raids on your settlements (transient; not persisted) */
  raids: Raid[]
  /** are RANDOM/automatic raids enabled? off by default — debug-toggleable (transient) */
  raidsEnabled: boolean
  /** seconds since the last "should anyone raid?" check (transient) */
  raidScan: number
  /** per-village cooldown before it may raid again, by village id (transient) */
  raidCooldowns: Record<number, number>
  /** fog-of-war breadcrumbs (spots a scout has explored) */
  explored: Vec2[]
  /** non-null while you're refounding after a capital loss (first-person survivor) */
  refounding: Refounding | null
  /** the fallen-star endgame arc (a meteor at Medieval), or null before it begins */
  endgame: Endgame | null
  /** forest trees felled by the survivor's axe this session (ids hidden from render) */
  choppedTrees: string[]
  /** in-progress axe damage on standing trees, by tree id (transient) */
  treeHits: Record<string, number>

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
  /** a point the camera is smoothly panning to (settlement switch), or null */
  cameraFocus: Vec2 | null

  // selectors / derived
  popCap: () => number
  storageCap: () => number
  /** max buildings allowed at the current tier */
  buildCap: () => number
  /** are we already at the building limit for this tier? */
  atBuildCap: () => boolean
  territoryRadius: () => number
  canAfford: (cost: Partial<Resources>) => boolean
  /** is this spot inside your realm — home borders OR any owned village's? */
  inTerritory: (p: Vec2) => boolean
  canPlaceAt: (p: Vec2, half: number, onField?: boolean) => boolean
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
  /** tear down a building: free its slot + workers, reclaim half the materials */
  demolishBuilding: (buildingId: number) => void
  gatherField: (fieldId: number) => void
  addPathPoint: (p: Vec2) => void
  endPath: () => void
  /** remove the road segment nearest the click (within ERASE_RANGE), if any */
  erasePath: (p: Vec2) => void

  // selection
  selectBuilding: (id: number) => void
  selectTownhall: () => void
  selectNpc: (id: number) => void
  selectMeteor: () => void
  clearSelection: () => void
  /** smoothly pan the camera to a settlement (set null to cancel) */
  focusCamera: (p: Vec2 | null) => void
  /** send the nearest idle villager to scout (and reveal fog toward) a spot */
  sendScoutTo: (p: Vec2) => void
  /** is this spot valid for a NEW settlement? (unclaimed, in range, well-spaced) */
  canSettleAt: (p: Vec2) => boolean
  /** dispatch the nearest idle villager to march out and found a settlement here */
  foundSettlement: (p: Vec2) => void
  /** muster a war party (idle villagers armed with weapons) to attack a village */
  attackVillage: (villageId: number) => void
  /** send an idle villager to a village as a missionary to convert it */
  sendMissionary: (villageId: number) => void
  /** advance an owned village one era (its own borders / housing / tribute grow) */
  upgradeVillage: (villageId: number) => void
  /** open the meteor: needs the whole continent owned + every storage maxed, drains them, raises the Starforge */
  openMeteor: () => void
  /** pick the endgame path once starmetal is maxed — spends it to build a portal / starship */
  chooseSpecialty: (s: 'magic' | 'tech') => void
  /** send your people through the portal / aboard the ship — the run is won */
  sendPeople: () => void
  /** the capital is destroyed: drop into first person as the lone survivor */
  destroyCapital: () => void
  /** first-person left-click: chop the tree / pick the berries / hit the deer in front */
  survivorChop: () => void
  /** found a new city once the survivor has gathered enough wood + food */
  foundNewCity: () => void

  // ---- persistence + debug ----
  saveGame: () => void
  resetGame: () => void
  /** debug: rebuild a representative base for the given town tier */
  debugSetupEra: (tier: number) => void
  /** debug: reveal every NPC village */
  debugDiscoverAll: () => void
  /** debug: force the given neutral village to raid your nearest settlement now */
  debugRaid: (villageId: number) => void
  /** debug: turn random/automatic raids on or off */
  toggleRaids: () => void
  /** set the simulation speed multiplier (1, 2, or 4) */
  setGameSpeed: (n: number) => void
  /** debug: jump to Medieval, own every village, max all storages, reveal the meteor */
  debugEndgame: () => void
  /** debug: open the meteor (if needed) and brim the Starmetal store, ready to choose a path */
  debugStarforgeFull: () => void
  /** debug: destroy the capital, then auto-gather + refound to test the whole cycle */
  debugRefound: () => void

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
  | 'refounding'
  | 'endgame'
>

/** a brand-new game (also resets the id counters) */
function freshState(): PersistSlice {
  nextVillagerId = 1
  nextBuildingId = 1
  nextPathId = 1
  TOWN_CENTER.x = 0 // a new game starts the capital back at the origin
  TOWN_CENTER.z = 0
  const npcVillages = makeNpcVillages()
  nextNpcVillagerId =
    npcVillages.reduce((m, v) => v.villagers.reduce((mm, nv) => Math.max(mm, nv.id), m), 0) + 1
  nextNpcVillageId = npcVillages.reduce((m, v) => Math.max(m, v.id), 0) + 1
  return {
    // start poor: not enough to build a lumberyard or upgrade the townhall.
    resources: { wood: 5, food: 20, stone: 0, mithril: 0, orichalcum: 0, starmetal: 0, weapons: 0 },
    villagers: [makeVillager(0), makeVillager(1), makeVillager(2)],
    tierIndex: 0,
    npcVillages,
    explored: [],
    buildings: [],
    paths: [],
    objectiveStep: 0,
    firstWoodDelivered: false,
    firstFoodDelivered: false,
    refounding: null,
    endgame: null,
  }
}

/** restore a save: sanitise it and resume id counters past the loaded ids */
function applySave(d: SaveData): PersistSlice {
  // mid-flight transient action states don't survive a reload — stand them down
  const villagers = d.villagers.map((v) =>
    v.state === 'held' || v.state === 'defending'
      ? { ...v, state: 'idle' as const, defendTarget: null }
      : v,
  )
  // raids are transient too — send any caught-out raiders home (clear their target)
  for (const village of d.npcVillages)
    for (const nv of village.villagers) nv.target = null
  const maxId = (arr: { id: number }[]) => arr.reduce((m, x) => Math.max(m, x.id), 0)
  nextVillagerId = maxId(villagers) + 1
  nextBuildingId = maxId(d.buildings) + 1
  nextPathId = maxId(d.paths) + 1
  nextNpcVillagerId =
    d.npcVillages.reduce((m, v) => v.villagers.reduce((mm, nv) => Math.max(mm, nv.id), m), 0) + 1
  nextNpcVillageId = d.npcVillages.reduce((m, v) => Math.max(m, v.id), 0) + 1
  TOWN_CENTER.x = d.townCenter?.x ?? 0 // restore the (possibly relocated) capital
  TOWN_CENTER.z = d.townCenter?.z ?? 0
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
    refounding: d.refounding ?? null,
    endgame: d.endgame ?? null,
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
    refounding: s.refounding,
    endgame: s.endgame,
    townCenter: { x: TOWN_CENTER.x, z: TOWN_CENTER.z },
  }
}

export const useGame = create<GameState>((set, get) => ({
  ...makeInitialState(),

  // ambient wildlife — regenerated each session, not part of the save
  animals: makeAnimals(),
  battles: [],
  raids: [],
  raidsEnabled: false, // random raids OFF for now — toggle in the debug menu
  gameSpeed: 1,
  raidScan: 0,
  raidCooldowns: {},
  choppedTrees: [],
  treeHits: {},

  // transient UI state — never persisted
  buildMode: 'none',
  pathDraft: [],
  cursorGround: { x: 0, z: 0 },
  heldId: null,
  hover: null,
  toasts: [],
  selection: null,
  cameraFocus: null,

  popCap: () => {
    const s = get()
    let cap = TOWN_TIERS[s.tierIndex].popCap + residencePop(s.buildings)
    // every captured village houses its own people (plus any houses you add there)
    for (const v of s.npcVillages) if (v.owner === 'player') cap += TOWN_TIERS[v.tierIndex].popCap
    return cap
  },

  storageCap: () => TOWN_TIERS[get().tierIndex].storageCap,
  buildCap: () => {
    const s = get()
    let cap = TOWN_TIERS[s.tierIndex].buildCap
    // every town you own carries its own build allowance
    for (const v of s.npcVillages) if (v.owner === 'player') cap += TOWN_TIERS[v.tierIndex].buildCap
    return cap
  },
  atBuildCap: () => get().buildings.length >= get().buildCap(),
  territoryRadius: () => TOWN_TIERS[get().tierIndex].territoryRadius,

  canAfford: (cost) => affords(get().resources, cost),

  inTerritory: (p) => {
    const s = get()
    if (dist(p, TOWN_CENTER) <= TOWN_TIERS[s.tierIndex].territoryRadius) return true
    for (const v of s.npcVillages)
      if (v.owner === 'player' && dist(p, v.center) <= v.territoryRadius) return true
    return false
  },

  canPlaceAt: (p, half, onField = false) => {
    const s = get()
    if (!s.inTerritory(p)) return false // outside your realm
    // a mine/quarry sitting ON its resource deposit is exempt from the keep-clear
    // rings around settlement cores — the deposit is the whole reason to build there
    if (!onField) {
      if (dist(p, TOWN_CENTER) < TOWN_CLEAR_RADIUS + half) return false
      for (const v of s.npcVillages)
        if (v.owner === 'player' && dist(p, v.center) < VILLAGE_CLEAR_RADIUS + half) return false
    }
    for (const b of s.buildings) {
      if (dist(p, b.pos) < buildingHalf(b) + half + 0.4) return false
    }
    return true
  },

  // production buildings must sit on a matching natural field (or open ground
  // for field-less ones like the hunter's lodge)
  canPlaceProduction: (p, kind) => {
    const def = PRODUCTION[kind]
    const onField =
      !!def.fieldType &&
      FIELDS.some((f) => f.type === def.fieldType && dist(p, f.pos) <= f.radius + FIELD_BUILD_RANGE)
    if (def.fieldType && !onField) return false // must sit on its matching field
    return get().canPlaceAt(p, def.half, onField)
  },

  tick: (dt) => {
    const { villagers, buildings, paths, resources, npcVillages } = get()
    const refounding = get().refounding

    // at the Medieval era a meteor falls far to the south — the endgame begins
    if (get().tierIndex >= MEDIEVAL_TIER && !get().endgame) {
      set({
        endgame: {
          meteorPos: { x: Math.cos(METEOR_ANGLE) * METEOR_DIST, z: Math.sin(METEOR_ANGLE) * METEOR_DIST },
          found: false,
          open: false,
          specialty: null,
          built: false,
          won: false,
        },
      })
      get().pushToast('A star falls from the heavens — a meteor has crashed in the far wilds!', 'warn')
    }
    // once cracked open, the Starforge is a drop-off hub of its own
    const eg = get().endgame
    const forgeHub = eg && eg.open && !eg.won ? eg.meteorPos : null
    const cap = TOWN_TIERS[get().tierIndex].storageCap
    const gained = emptyResources()
    const discovered: string[] = [] // villages a scout reached this tick
    const reached = new Set<number>() // villages a war party reached this tick (start a battle)
    const founded: Vec2[] = [] // spots where a settler founded a new settlement this tick

    // a worker's resource is "full" once the live stockpile (incl. this tick's
    // deliveries so far) hits the cap — those workers loiter instead of working.
    const isFull = (type: ResourceType) => resources[type] + gained[type] >= cap

    for (const v of villagers) {
      // the lone survivor is driven manually in first person — skip its AI
      if (refounding && v.id === refounding.survivorId) continue
      switch (v.state) {
        case 'idle': {
          wanderAroundHub(v, npcVillages, dt)
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
          // a scout passing the fallen star reveals it (the endgame meteor)
          const eg = get().endgame
          if (eg && !eg.found && dist(v.pos, eg.meteorPos) <= METEOR_FOUND_RADIUS) {
            set({ endgame: { ...eg, found: true } })
            get().pushToast('Your scout reached the fallen star — something stirs within.', 'good')
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

        case 'defending': {
          // rally to the clash point and hold the line against the raiders
          if (!v.defendTarget) {
            v.state = 'idle'
            break
          }
          faceToward(v, v.defendTarget)
          if (dist(v.pos, v.defendTarget) > 1.5) moveToward(v.pos, v.defendTarget, MARCH_SPEED * dt)
          break
        }

        case 'settling': {
          // a settler marches out; on arrival it founds a new settlement here
          if (!v.scoutTarget) {
            v.state = 'idle'
            break
          }
          faceToward(v, v.scoutTarget)
          if (moveToward(v.pos, v.scoutTarget, SETTLER_SPEED * dt)) {
            founded.push({ x: v.pos.x, z: v.pos.z })
            v.state = 'idle' // the founder now garrisons the new settlement
            v.scoutTarget = null
            v.wanderTarget = null
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
            wanderAroundHub(v, npcVillages, dt)
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
          // haul to the nearest hub (townhall or an owned village), so an outpost
          // building drops off locally instead of trekking all the way home
          if (v.route === null) beginTrip(v, nearestHub(v.pos, npcVillages, forgeHub), paths)
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

    // (refounding harvesting is click-driven — see survivorChop)

    // war parties, conversions & the village economy. Loot and tribute both feed
    // `gained`, so this must run BEFORE the resource apply.
    {
      const conquered: string[] = []
      const converted: string[] = []
      const dead = new Set<number>()
      const recruited: Villager[] = [] // a won village's people join your ranks
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
          recruited.push(...recruitFrom(village)) // its people become your villagers
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
          recruited.push(...recruitFrom(village)) // its people become your villagers
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
      if (dead.size || recruited.length)
        set({ villagers: [...get().villagers.filter((x) => !dead.has(x.id)), ...recruited] })
      for (const name of conquered) get().pushToast(`${name} conquered — it joins your realm!`, 'good')
      for (const name of converted) get().pushToast(`${name} converted — it joins your realm!`, 'good')
    }

    // ---- raids: a neutral village marches on YOU; rally a defence or lose ----
    {
      const cd = get().raidCooldowns
      for (const id in cd) cd[id] = Math.max(0, cd[id] - dt)

      const deadDefenders = new Set<number>()
      const deadRaiders = new Set<number>()
      const finished: Raid[] = []
      const resolveToasts: { msg: string; kind: Toast['kind'] }[] = []
      let villagesChanged = false
      let refoundAfter = false // a capital wipe drops you into the refounding survival mode

      const standDownDefenders = () => {
        for (const v of get().villagers)
          if (v.state === 'defending') {
            v.state = 'idle'
            v.defendTarget = null
          }
      }

      for (const raid of get().raids) {
        const from = get().npcVillages.find((v) => v.id === raid.fromVillageId)
        const liveRaiders = from ? from.villagers.filter((nv) => raid.raiderIds.includes(nv.id)) : []
        // raid fizzles if the attacker is gone, you took it, or every raider fell
        if (!from || from.owner !== 'neutral' || liveRaiders.length === 0) {
          for (const nv of liveRaiders) if (from) nv.target = { x: from.center.x, z: from.center.z }
          standDownDefenders()
          finished.push(raid)
          continue
        }

        if (raid.phase === 'march') {
          // the melee begins once a raider reaches the clash line
          if (!liveRaiders.some((nv) => dist(nv.pos, raid.clash) <= ENGAGE_RADIUS)) continue
          raid.phase = 'fight'
          raid.timer = 0
          const defenders = get().villagers.filter(
            (v) => v.state === 'defending' && dist(v.pos, raid.clash) <= DEFEND_RALLY,
          )
          // outcome: raider count × their age vs your defenders × your age (× home edge)
          const atk = liveRaiders.length * (0.8 + from.tierIndex * 0.25)
          const def = defenders.length * (0.8 + get().tierIndex * 0.25) * RAID_HOME_ADVANTAGE
          raid.defenderWins = def >= atk
          const stagger = (n: number, pool: { id: number }[]) =>
            pool.slice(0, Math.max(0, n)).map((x) => ({
              id: x.id,
              at: 0.8 + Math.random() * (BATTLE_DURATION - 1.4),
              dead: false,
            }))
          // the loser takes the brunt; the winner pays a smaller toll
          raid.doomedRaiders = stagger(
            raid.defenderWins ? Math.ceil(liveRaiders.length * 0.6) : Math.floor(liveRaiders.length * 0.3),
            liveRaiders,
          )
          raid.doomedDefenders = stagger(
            raid.defenderWins ? Math.floor(defenders.length * 0.2) : Math.ceil(defenders.length * 0.7),
            defenders,
          )
          continue
        }

        // phase === 'fight': both sides fall one-by-one, then it resolves
        raid.timer += dt
        for (const d of raid.doomedRaiders)
          if (!d.dead && raid.timer >= d.at) (d.dead = true), deadRaiders.add(d.id)
        for (const d of raid.doomedDefenders)
          if (!d.dead && raid.timer >= d.at) (d.dead = true), deadDefenders.add(d.id)
        if (raid.timer < BATTLE_DURATION) continue
        finished.push(raid)

        const survivors = from.villagers.filter(
          (nv) => raid.raiderIds.includes(nv.id) && !deadRaiders.has(nv.id),
        )
        for (const nv of survivors) nv.target = { x: from.center.x, z: from.center.z } // withdraw home

        if (raid.defenderWins) {
          resolveToasts.push({ msg: `You repelled ${from.name}'s raid!`, kind: 'good' })
        } else {
          const lost =
            raid.targetVillageId != null
              ? get().npcVillages.find((v) => v.id === raid.targetVillageId)
              : null
          if (lost && lost.owner === 'player') {
            // an outpost is seized back: turns neutral, fresh inhabitants move in,
            // your buildings inside its borders are razed
            lost.owner = 'neutral'
            lost.influence = 0
            const n = 3 + lost.tierIndex
            const reborn: NpcVillager[] = []
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2
              const rad = 1.6 + (i % 2) * 1.4
              reborn.push({
                id: nextNpcVid(),
                pos: { x: lost.center.x + Math.cos(a) * rad, z: lost.center.z + Math.sin(a) * rad },
                heading: a,
                wanderTarget: null,
                restTimer: 0,
                target: null,
                bob: i * 1.6,
              })
            }
            lost.villagers = reborn
            villagesChanged = true
            const razed = new Set(
              get()
                .buildings.filter((b) => dist(b.pos, lost.center) <= lost.territoryRadius)
                .map((b) => b.id),
            )
            if (razed.size) set({ buildings: get().buildings.filter((b) => !razed.has(b.id)) })
            resolveToasts.push({ msg: `${from.name} overran and seized ${lost.name}!`, kind: 'warn' })
          } else {
            // a wipe that leaves almost no one DESTROYS the capital (→ refounding);
            // a survivable loss is just a sacking
            const remaining = get().villagers.filter((v) => !deadDefenders.has(v.id)).length
            if (remaining <= REFOUND_TRIGGER_POP) {
              refoundAfter = true
            } else {
              set((s2) => {
                const next = { ...s2.resources }
                for (const t of RESOURCE_TYPES) next[t] = Math.floor(next[t] * (1 - PILLAGE_FRACTION))
                return { resources: next }
              })
              resolveToasts.push({ msg: `${from.name} sacked your capital — supplies plundered!`, kind: 'warn' })
            }
          }
        }
        standDownDefenders() // only one raid runs at a time
        cd[raid.fromVillageId] = RAID_COOLDOWN
      }

      if (deadRaiders.size) {
        for (const v of get().npcVillages) v.villagers = v.villagers.filter((nv) => !deadRaiders.has(nv.id))
        villagesChanged = true
      }
      if (deadDefenders.size) set({ villagers: get().villagers.filter((v) => !deadDefenders.has(v.id)) })
      if (villagesChanged) set({ npcVillages: [...get().npcVillages] })
      if (finished.length) set({ raids: get().raids.filter((r) => !finished.includes(r)) })
      for (const t of resolveToasts) get().pushToast(t.msg, t.kind)
      if (refoundAfter) get().destroyCapital() // the capital fell — enter first-person survival

      // ---- maybe a neutral neighbour launches a fresh raid (when enabled) ----
      set((s2) => ({ raidScan: s2.raidScan + dt }))
      if (get().raidsEnabled && get().raidScan >= RAID_CHECK_INTERVAL) {
        set({ raidScan: 0 })
        if (get().raids.length === 0 && !get().refounding) {
          const cands = get().npcVillages.filter(
            (v) =>
              v.discovered &&
              v.owner === 'neutral' &&
              (cd[v.id] ?? 0) <= 0 &&
              v.villagers.length > RAID_MIN_PARTY,
          )
          if (cands.length) {
            // the biggest threat strikes (highest age, then most people)
            cands.sort(
              (a, b) => b.tierIndex * 10 + b.villagers.length - (a.tierIndex * 10 + a.villagers.length),
            )
            startRaid(cands[0])
          }
        }
      }
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

    // a settler arrived and founded a new settlement — add it as a player hub
    if (founded.length) {
      const newVills = founded.map((pos) => makeFoundedSettlement(pos, nextNpcVillageId++))
      set({ npcVillages: [...get().npcVillages, ...newVills] })
      for (const nv of newVills) get().pushToast(`${nv.name} founded — a new settlement rises!`, 'good')
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
          an.hits = 0
        }
      }
    }

    // NPC village inhabitants amble in place — march out on a raid — or rush to
    // defend their own village when YOU attack it
    for (const village of get().npcVillages) {
      const underAttack = get().battles.some((b) => b.villageId === village.id)
      const defendClash = underAttack ? clashPoint(village.center) : null
      for (const nv of village.villagers) {
        if (nv.target) {
          // marching out to raid your settlement (then home once the raid ends)
          nv.heading = Math.atan2(nv.target.x - nv.pos.x, nv.target.z - nv.pos.z)
          const arrived = moveToward(nv.pos, nv.target, MARCH_SPEED * dt)
          if (arrived && dist(nv.pos, village.center) < 2) nv.target = null // home — resume life
        } else if (defendClash) {
          nv.heading = Math.atan2(defendClash.x - nv.pos.x, defendClash.z - nv.pos.z)
          if (dist(nv.pos, defendClash) > 2) moveToward(nv.pos, defendClash, ANIMAL_SPEED * 2.4 * dt)
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
    if (!s.inTerritory(p)) {
      s.pushToast('Outside your realm — expand, conquer a village, or found a settlement here', 'warn')
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
    if (!s.inTerritory(p)) {
      s.pushToast('Outside your realm — expand, conquer a village, or found a settlement here', 'warn')
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
        orichalcumdeposit: 'An Orichalcum Mine must sit on an orichalcum deposit',
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

  // tear down one of your buildings — frees the slot + ground, releases its
  // workers to idle, and hands back half the materials (for restructuring)
  demolishBuilding: (buildingId) => {
    const s = get()
    const b = s.buildings.find((x) => x.id === buildingId)
    if (!b) return
    if (b.kind === 'starforge') return // the fallen star can't be rebuilt — never raze it
    const refund = demolishRefund(b)
    const workerIds = isProduction(b) ? b.workers : []
    // release anyone employed here back to idle
    for (const v of s.villagers) {
      if (v.state !== 'held' && (workerIds.includes(v.id) || v.workplaceId === buildingId)) {
        v.workplaceId = null
        v.forageFieldId = null
        v.carry = 0
        v.carryType = null
        v.route = null
        v.wanderTarget = null
        v.state = 'idle'
      }
    }
    const lvls = isProduction(b) ? PRODUCTION[b.kind].levels : null
    const name = lvls
      ? lvls[Math.min(b.level, lvls.length - 1)].name
      : RESIDENCE_ERAS[b.level]?.name ?? 'building'
    const cap = TOWN_TIERS[s.tierIndex].storageCap
    set((st) => {
      const res = { ...st.resources }
      for (const t of RESOURCE_TYPES) res[t] = Math.min(cap, res[t] + (refund[t] ?? 0))
      return {
        resources: res,
        buildings: st.buildings.filter((x) => x.id !== buildingId),
        selection: null,
      }
    })
    const reclaimed = RESOURCE_TYPES.some((t) => (refund[t] ?? 0) > 0)
    s.pushToast(`Demolished ${name}${reclaimed ? ` · reclaimed ${costText(refund)}` : ''}`, 'info')
  },

  // send the nearest idle villager to gather a field by hand (slow, no building)
  gatherField: (fieldId) => {
    const s = get()
    const f = FIELDS.find((x) => x.id === fieldId)
    if (!f) return
    // you can pick up wood/food/stone by hand, but mithril needs the Mithril Age
    if (f.type === 'mithrildeposit' && !resourceUnlocked('mithril', s.tierIndex)) {
      s.pushToast('You can’t mine mithril yet — reach the Mithril Age', 'warn')
      return
    }
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

  canSettleAt: (p) => {
    const s = get()
    if (s.tierIndex < EXPANSION_TIER) return false
    if (Math.hypot(p.x, p.z) > SETTLE_MAX_RANGE) return false // inside the world (the mountains)
    if (dist(p, TOWN_CENTER) < SETTLE_MIN_DIST) return false // away from your capital
    for (const v of s.npcVillages) if (dist(p, v.center) < SETTLE_MIN_DIST) return false // and every village
    return true
  },

  foundSettlement: (p) => {
    const s = get()
    if (s.tierIndex < EXPANSION_TIER) {
      s.pushToast('Founding settlements unlocks in the Age of Expansion', 'warn')
      return
    }
    if (!s.canAfford(SETTLE_COST)) {
      s.pushToast(`Need ${costText(SETTLE_COST)} to send settlers`, 'warn')
      return
    }
    if (!s.canSettleAt(p)) {
      s.pushToast('Settle on open ground, well away from other settlements', 'warn')
      return
    }
    // the nearest idle villager to the spot becomes the settler
    let settler: Villager | null = null
    let bestD = Infinity
    for (const v of s.villagers) {
      if (v.state === 'idle' && v.workplaceId === null && v.forageFieldId === null) {
        const d = dist(v.pos, p)
        if (d < bestD) {
          bestD = d
          settler = v
        }
      }
    }
    if (!settler) {
      s.pushToast('No idle villager free to send as a settler', 'warn')
      return
    }
    set((st) => ({ resources: spend(st.resources, SETTLE_COST), buildMode: 'none' }))
    settler.state = 'settling'
    settler.scoutTarget = { x: p.x, z: p.z }
    settler.route = null
    settler.wanderTarget = null
    s.pushToast('A settler sets out to found a new settlement…', 'info')
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

  // advance an owned village one era — it grows like your own town: wider borders,
  // more housing (pop cap) + build allowance, a richer tribute, and a grander look.
  // A vassal can't out-rank your capital, so you raise your own town first.
  upgradeVillage: (villageId) => {
    const s = get()
    const v = s.npcVillages.find((x) => x.id === villageId)
    if (!v || v.owner !== 'player') return
    const nextTier = v.tierIndex + 1
    if (nextTier >= TOWN_TIERS.length) {
      s.pushToast('This town is already at the highest age', 'warn')
      return
    }
    if (nextTier > s.tierIndex) {
      s.pushToast(`Advance your own town to the ${TOWN_TIERS[nextTier].era} first`, 'warn')
      return
    }
    const cost = TOWN_TIERS[nextTier].upgradeCost
    if (!cost || !s.canAfford(cost)) {
      s.pushToast(`Need ${costText(cost ?? {})}`, 'warn')
      return
    }
    const era = RESIDENCE_ERAS[Math.min(nextTier, RESIDENCE_ERAS.length - 1)].model
    // one new dwelling joins the ring as it grows
    const a = Math.random() * Math.PI * 2
    const rad = 2.8 + Math.random() * 1.6
    const hx = v.center.x + Math.cos(a) * rad
    const hz = v.center.z + Math.sin(a) * rad
    const newHut = { pos: { x: hx, z: hz }, rot: Math.atan2(v.center.x - hx, v.center.z - hz), model: era }
    set((st) => ({
      resources: spend(st.resources, cost),
      npcVillages: st.npcVillages.map((x) =>
        x.id !== villageId
          ? x
          : {
              ...x,
              tierIndex: nextTier,
              territoryRadius: TOWN_TIERS[nextTier].territoryRadius * 0.6,
              income: villageIncome(nextTier),
              huts: [...x.huts.map((h) => ({ ...h, model: era })), newHut],
            },
      ),
    }))
    s.pushToast(`${v.name} advanced to the ${TOWN_TIERS[nextTier].era}!`, 'good')
  },

  // ---- endgame: the fallen star ----
  openMeteor: () => {
    const s = get()
    const eg = s.endgame
    if (!eg || !eg.found || eg.open) return
    // the whole continent must be yours
    if (!s.npcVillages.every((v) => v.owner === 'player')) {
      s.pushToast('The star resists — first take every village on the continent', 'warn')
      return
    }
    // and every storehouse brimming (starmetal doesn't exist yet, so it's exempt)
    const cap = TOWN_TIERS[s.tierIndex].storageCap
    if (!RESOURCE_TYPES.every((t) => t === 'starmetal' || s.resources[t] >= cap)) {
      s.pushToast('Fill every storehouse to the brim, then give it ALL', 'warn')
      return
    }
    // pay it all; the Starforge blazes to life at the crater
    const forge: Building = {
      id: nextBuildingId++,
      kind: 'starforge',
      level: 0,
      pos: { x: eg.meteorPos.x, z: eg.meteorPos.z },
      rot: 0,
      workers: [],
    }
    set((st) => ({
      resources: emptyResources(),
      buildings: [...st.buildings, forge],
      endgame: { ...eg, open: true },
    }))
    s.pushToast('The meteor splits open — a Starforge blazes within! Fuse orichalcum + mithril into Starmetal.', 'good')
  },

  chooseSpecialty: (specialty) => {
    const s = get()
    const eg = s.endgame
    if (!eg || !eg.open || eg.specialty) return
    const cap = TOWN_TIERS[s.tierIndex].storageCap
    if (s.resources.starmetal < cap) {
      s.pushToast('Forge your Starmetal store to the brim first', 'warn')
      return
    }
    set((st) => ({
      resources: { ...st.resources, starmetal: 0 }, // all of it goes into the great work
      endgame: { ...eg, specialty, built: true },
    }))
    s.pushToast(
      specialty === 'magic'
        ? 'The Starmetal tears a shimmering portal into the multiverse!'
        : 'The Starmetal forms a gleaming starship, ready for the void!',
      'good',
    )
  },

  sendPeople: () => {
    const s = get()
    const eg = s.endgame
    if (!eg || !eg.built || eg.won) return
    // the people pass through / aboard — the realm ascends. Victory.
    set({ endgame: { ...eg, won: true }, villagers: [], selection: null })
  },

  // ---- last survivor / refounding ----
  destroyCapital: () => {
    const s = get()
    if (s.refounding) return
    // one villager crawls from the ashes — prefer a living, un-held one
    const survivor = s.villagers.find((v) => v.state !== 'held') ?? s.villagers[0] ?? makeVillager(0)
    survivor.state = 'idle'
    survivor.workplaceId = null
    survivor.forageFieldId = null
    survivor.carry = 0
    survivor.carryType = null
    survivor.route = null
    survivor.wanderTarget = null
    survivor.scoutTarget = null
    survivor.scoutReturning = false
    survivor.huntAnimalId = null
    survivor.targetVillageId = null
    survivor.defendTarget = null
    survivor.pos = { x: 2, z: 2 } // amid the ruins of the town centre
    survivor.heading = 0
    set({
      villagers: [survivor],
      buildings: [], // the town is razed
      paths: [],
      tierIndex: 0, // back to the dawn — rebuild from nothing
      resources: { wood: 0, food: 8, stone: 0, mithril: 0, orichalcum: 0, starmetal: 0, weapons: 0 },
      selection: null,
      buildMode: 'none',
      heldId: null,
      battles: [],
      raids: [],
      choppedTrees: [], // the forest stands whole again for the survivor to fell
      treeHits: {},
      refounding: { woodGoal: REFOUND_WOOD_GOAL, foodGoal: REFOUND_FOOD_GOAL, survivorId: survivor.id },
    })
    s.pushToast('Your capital has fallen! One survivor remains — found a new city.', 'warn')
  },

  // first-person harvest: a left-click swings at whatever's in front of the
  // survivor — a deer (hunt), a forest (chop wood) or a berry patch (pick food)
  survivorChop: () => {
    const s = get()
    const rf = s.refounding
    if (!rf) return
    const v = s.villagers.find((x) => x.id === rf.survivorId)
    if (!v) return
    const fx = Math.sin(v.heading)
    const fz = Math.cos(v.heading)
    // dot of the (normalised) direction to a point with the survivor's facing
    const facing = (p: Vec2) => {
      const dx = p.x - v.pos.x
      const dz = p.z - v.pos.z
      const d = Math.hypot(dx, dz) || 1
      return (dx / d) * fx + (dz / d) * fz
    }

    // prefer a deer you're looking at and within reach of (the hunt)
    let prey: Animal | null = null
    let preyD = CHOP_REACH
    for (const an of s.animals) {
      if (!an.alive) continue
      const d = dist(v.pos, an.pos)
      if (d <= preyD && facing(an.pos) > 0.2) {
        preyD = d
        prey = an
      }
    }
    const cap = TOWN_TIERS[s.tierIndex].storageCap
    const give = (type: ResourceType, n: number) =>
      set((st) => ({ resources: { ...st.resources, [type]: Math.min(cap, st.resources[type] + n) } }))

    if (prey) {
      prey.hits += 1 // a swing lands on the deer; it drops once worn down
      if (prey.hits >= DEER_HP) {
        prey.alive = false
        prey.hits = 0
        prey.respawnTimer = ANIMAL_RESPAWN
        give('food', HUNT_FOOD)
      }
      return
    }

    // next: the nearest standing tree you're facing & within reach — chop it
    // down over several swings, then it's felled for wood
    const chopped = new Set(s.choppedTrees)
    let tree: { id: string; pos: Vec2 } | null = null
    let treeD = CHOP_REACH + 0.4
    for (const t of CHOP_TREES) {
      if (chopped.has(t.id)) continue
      const d = dist(v.pos, t.pos)
      if (d <= treeD && facing(t.pos) > 0) {
        treeD = d
        tree = t
      }
    }
    if (tree) {
      const h = (s.treeHits[tree.id] ?? 0) + 1
      if (h >= TREE_HP) {
        delete s.treeHits[tree.id]
        set({ choppedTrees: [...s.choppedTrees, tree.id] }) // it falls — render hides it
        give('wood', TREE_WOOD)
      } else {
        s.treeHits[tree.id] = h
      }
      return
    }

    // else a berry patch you've reached — pick a handful of food
    let field: ResourceField | null = null
    let bestEdge = CHOP_REACH
    for (const f of FIELDS) {
      if (f.type !== 'berryfield') continue
      const edge = dist(v.pos, f.pos) - f.radius
      if (edge <= bestEdge && facing(f.pos) > -0.1) {
        bestEdge = edge
        field = f
      }
    }
    if (field) give('food', PICK_FOOD)
  },

  foundNewCity: () => {
    const s = get()
    const rf = s.refounding
    if (!rf) return
    if (s.resources.wood < rf.woodGoal || s.resources.food < rf.foodGoal) {
      s.pushToast(`Need ${rf.woodGoal} wood and ${rf.foodGoal} food to found your city`, 'warn')
      return
    }
    // the capital rises wherever the survivor is standing now
    const survivor = s.villagers.find((v) => v.id === rf.survivorId)
    if (survivor) {
      TOWN_CENTER.x = survivor.pos.x
      TOWN_CENTER.z = survivor.pos.z
    }
    // settle the founder + two fellow settlers in the ring around the new campfire
    if (survivor) {
      survivor.pos = spawnSpot(0)
      survivor.heading = 0
      survivor.state = 'idle'
      survivor.wanderTarget = null
    }
    const settlers = [makeVillager(1), makeVillager(2)]
    set((st) => ({
      resources: {
        ...st.resources,
        wood: st.resources.wood - rf.woodGoal,
        food: st.resources.food - rf.foodGoal,
      },
      villagers: [...st.villagers, ...settlers],
      tierIndex: 0,
      choppedTrees: [], // the felled forest regrows as the new city takes root
      treeHits: {},
      refounding: null,
    }))
    s.pushToast('A new city rises from the ashes — long may it stand!', 'good')
  },

  // ---- selection (for the management panel) ----
  selectBuilding: (id) => set({ selection: { kind: 'building', id } }),
  selectTownhall: () => set({ selection: { kind: 'townhall' } }),
  selectNpc: (id) => set({ selection: { kind: 'npc', id } }),
  selectMeteor: () => set({ selection: { kind: 'meteor' } }),
  clearSelection: () => set({ selection: null }),
  focusCamera: (p) => set({ cameraFocus: p ? { x: p.x, z: p.z } : null }),

  addPathPoint: (p) => {
    const hubs = get()
      .npcVillages.filter((v) => v.owner === 'player')
      .map((v) => v.center)
    const snap = snapPathPoint(p, get().buildings, hubs)
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

  erasePath: (p) => {
    const paths = get().paths
    let best: PathSegment | null = null
    let bestD = ERASE_RANGE
    for (const s of paths) {
      const d = pointSegDist(p, s.a, s.b)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    if (best) set({ paths: paths.filter((s) => s.id !== best!.id) })
  },

  // ---- hand of god ----
  pickUpVillager: (villagerId) => {
    if (get().refounding) return // no hand-of-god while you ARE a villager
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
    v.defendTarget = null
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
    // dropped onto a field? -> gather it by hand (slow). mithril is off-limits
    // until the Mithril Age, so a drop there just relocates the villager instead.
    const field = target
      ? null
      : FIELDS.find(
          (f) =>
            dist(v.pos, f.pos) <= f.radius + 0.6 &&
            !(f.type === 'mithrildeposit' && !resourceUnlocked('mithril', get().tierIndex)),
        )
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
      raids: [],
      raidScan: 0,
      raidCooldowns: {},
      choppedTrees: [],
      treeHits: {},
      buildMode: 'none',
      pathDraft: [],
      cursorGround: { x: 0, z: 0 },
      heldId: null,
      hover: null,
      selection: null,
      cameraFocus: null,
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

    // a representative town has just enough people to staff every workplace plus
    // a small idle reserve — NOT the full housing cap (which would pile up idlers)
    let totalSlots = 0
    for (const b of buildings) {
      if (!isProduction(b)) continue
      const levels = PRODUCTION[b.kind].levels
      totalSlots += levels[Math.min(b.level, levels.length - 1)].slots
    }
    // idle reserve scales with the era: lean early, a standing army's worth in
    // the combat ages (Age of Expansion on) so you can muster war parties
    const idleReserve = 3 + Math.max(0, t - 2) * 4
    const popCap = TOWN_TIERS[t].popCap + residencePop(buildings)
    const villagerCount = Math.min(popCap, totalSlots + idleReserve)
    const villagers: Villager[] = []
    for (let i = 0; i < villagerCount; i++) villagers.push(makeVillager(i))
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
        orichalcum: t >= 3 ? Math.floor(cap * 0.2) : 0,
        starmetal: 0,
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

  debugRaid: (villageId) => {
    const from = get().npcVillages.find((v) => v.id === villageId)
    if (!from || from.owner !== 'neutral' || from.villagers.length < 2) {
      get().pushToast('That village can’t raid right now', 'warn')
      return
    }
    startRaid(from)
  },

  toggleRaids: () => {
    const on = !get().raidsEnabled
    set({ raidsEnabled: on, raidScan: 0 })
    get().pushToast(on ? 'Random raids enabled' : 'Random raids disabled', 'info')
  },

  setGameSpeed: (n) => set({ gameSpeed: n }),

  debugEndgame: () => {
    const cap = TOWN_TIERS[MEDIEVAL_TIER].storageCap
    const res = emptyResources()
    for (const t of RESOURCE_TYPES) res[t] = t === 'starmetal' ? 0 : cap
    const meteorPos = { x: Math.cos(METEOR_ANGLE) * METEOR_DIST, z: Math.sin(METEOR_ANGLE) * METEOR_DIST }
    set((st) => ({
      tierIndex: Math.max(st.tierIndex, MEDIEVAL_TIER),
      resources: res,
      npcVillages: st.npcVillages.map((v) => ({ ...v, owner: 'player' as const, discovered: true })),
      endgame: {
        meteorPos,
        found: true,
        open: st.endgame?.open ?? false,
        specialty: st.endgame?.specialty ?? null,
        built: st.endgame?.built ?? false,
        won: st.endgame?.won ?? false,
      },
    }))
    get().pushToast('Debug: continent owned + storages maxed + meteor found — open it!', 'info')
  },

  debugStarforgeFull: () => {
    // make sure the meteor is cracked open (Starforge exists), then brim Starmetal
    if (!get().endgame?.open) {
      get().debugEndgame() // found + own all + max storages
      get().openMeteor() // drains storages, spawns the Starforge, open=true
    }
    const cap = TOWN_TIERS[get().tierIndex].storageCap
    set((s) => ({ resources: { ...s.resources, starmetal: cap } }))
    get().pushToast('Debug: Starmetal store filled — choose magic or technology', 'info')
  },

  // destroy the capital, then auto-gather + found a new city to test the cycle
  debugRefound: () => {
    if (!get().refounding) get().destroyCapital()
    const rf = get().refounding
    if (!rf) return
    set((st) => ({ resources: { ...st.resources, wood: rf.woodGoal, food: rf.foodGoal } }))
    get().foundNewCity()
  },
}))

// dev-only handle for debugging / driving the sim from the console
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as {
    __game: typeof useGame
    __roadConnected: typeof roadConnected
    __chopTrees: typeof CHOP_TREES
    __townCenter: typeof TOWN_CENTER
    __fields: typeof FIELDS
  }
  w.__game = useGame
  w.__roadConnected = roadConnected
  w.__chopTrees = CHOP_TREES
  w.__townCenter = TOWN_CENTER
  w.__fields = FIELDS
}
