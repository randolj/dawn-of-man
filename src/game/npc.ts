import type { NpcVillage, NpcVillager, Resources } from './types'
import { RESIDENCE_ERAS, TOWN_TIERS } from './config'

// Deterministic neutral settlements scattered in the world. For now they just
// exist: their inhabitants amble around and the village slowly accrues its own
// resources. Later phases turn these into diplomacy / conversion / conquest
// targets — and eventually player + NPC villages share one Village model.

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Spec {
  name: string
  angle: number
  dist: number
  /** era / size, index into TOWN_TIERS */
  tier: number
}

// Far out past your fields & territory, in open ground (mountains ring ~110+).
// You won't see them until a scout makes contact.
const SPECS: Spec[] = [
  { name: 'Ashfen', angle: 2.7, dist: 80, tier: 1 },
  { name: 'Stonebrook', angle: 5.9, dist: 100, tier: 2 },
]

/** a village's passive economy (tribute once it's yours), scaling with its era */
export function villageIncome(tier: number): Resources {
  return { wood: 0.5 * (tier + 1), food: 0.4 * (tier + 1), stone: 0, mithril: 0, orichalcum: 0, starmetal: 0, weapons: 0 }
}

/** world-space centres of every NPC village (fields.ts seeds resources near them) */
export const VILLAGE_SITES = SPECS.map((s) => ({
  x: Math.cos(s.angle) * s.dist,
  z: Math.sin(s.angle) * s.dist,
  tier: s.tier,
}))

function makeVillage(s: Spec, id: number, r: () => number, nextVid: () => number): NpcVillage {
  const cx = Math.cos(s.angle) * s.dist
  const cz = Math.sin(s.angle) * s.dist
  const center = { x: cx, z: cz }
  const tier = TOWN_TIERS[s.tier]
  const model = RESIDENCE_ERAS[s.tier].model

  const hutCount = 3 + s.tier
  const huts = []
  for (let i = 0; i < hutCount; i++) {
    const a = (i / hutCount) * Math.PI * 2 + (r() - 0.5) * 0.5
    const rad = 2.6 + r() * 1.8
    const hx = cx + Math.cos(a) * rad
    const hz = cz + Math.sin(a) * rad
    huts.push({ pos: { x: hx, z: hz }, rot: Math.atan2(cx - hx, cz - hz), model })
  }

  const villagers: NpcVillager[] = []
  const vilCount = 3 + s.tier
  for (let i = 0; i < vilCount; i++) {
    const a = r() * Math.PI * 2
    const rad = 1.4 + r() * 2.6
    villagers.push({
      id: nextVid(),
      pos: { x: cx + Math.cos(a) * rad, z: cz + Math.sin(a) * rad },
      heading: r() * Math.PI * 2,
      wanderTarget: null,
      restTimer: r() * 2,
      target: null,
      bob: r() * 6,
    })
  }

  const income = villageIncome(s.tier)
  const resources: Resources = {
    wood: 20 + Math.floor(r() * 30),
    food: 20 + Math.floor(r() * 30),
    stone: s.tier >= 2 ? 10 + Math.floor(r() * 15) : 0,
    mithril: 0,
    orichalcum: 0,
    starmetal: 0,
    weapons: 0,
  }

  return {
    id,
    name: s.name,
    discovered: false,
    owner: 'neutral',
    influence: 0,
    center,
    tierIndex: s.tier,
    territoryRadius: tier.territoryRadius * 0.6,
    resources,
    income,
    huts,
    villagers,
  }
}

/** a fresh set of NPC villages (the store owns + mutates these) */
export function makeNpcVillages(): NpcVillage[] {
  const r = rng(2026)
  let vid = 1
  const nextVid = () => vid++
  return SPECS.map((s, i) => makeVillage(s, i + 1, r, nextVid))
}
