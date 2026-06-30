import type { ResourceField } from './types'
import { VILLAGE_SITES } from './npc'

// Natural resource areas you build production on: forests (wood) and berry
// fields (food). Generated once from a fixed seed so they're stable, and we
// precompute the cluster of trees/bushes inside each for rendering.

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

export interface Clump {
  x: number
  z: number
  scale: number
  tone: number
}

interface FieldData {
  field: ResourceField
  clumps: Clump[]
}

function scatter(r: () => number, cx: number, cz: number, radius: number, count: number): Clump[] {
  const out: Clump[] = []
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * radius // even-ish areal distribution
    out.push({
      x: cx + Math.cos(a) * d,
      z: cz + Math.sin(a) * d,
      scale: 0.7 + r() * 0.7,
      tone: r(),
    })
  }
  return out
}

function build(): FieldData[] {
  const r = rng(7777)
  const data: FieldData[] = []
  let id = 1

  // Forests & berry fields ring the starting area. Rock outcrops sit further
  // out — beyond your initial borders — so quarrying stone is a reward for
  // upgrading the townhall and growing your territory.
  const specs: { type: ResourceField['type']; angle: number; dist: number; radius: number }[] = [
    { type: 'forest', angle: 0.5, dist: 12, radius: 3.6 },
    { type: 'forest', angle: 3.5, dist: 13, radius: 3.6 },
    { type: 'berryfield', angle: 2.0, dist: 11, radius: 2.8 },
    { type: 'berryfield', angle: 4.9, dist: 12, radius: 2.8 },
    { type: 'rock', angle: 1.25, dist: 23.5, radius: 2.6 },
    { type: 'rock', angle: 5.5, dist: 24.5, radius: 2.6 },
    // mithril ore deposits — further out, reachable once your borders grow into the Mithril Age
    { type: 'mithrildeposit', angle: 0.9, dist: 30, radius: 2.7 },
    { type: 'mithrildeposit', angle: 4.2, dist: 32, radius: 2.7 },
  ]

  for (const s of specs) {
    const x = Math.cos(s.angle) * s.dist
    const z = Math.sin(s.angle) * s.dist
    const field: ResourceField = { id: id++, type: s.type, pos: { x, z }, radius: s.radius }
    const count = s.type === 'forest' ? 15 : s.type === 'berryfield' ? 12 : 7
    data.push({ field, clumps: scatter(r, x, z, s.radius, count) })
  }

  // Each settled village has a forest and a berry patch just outside its core,
  // so a captured village can be developed into a self-sufficient forward base
  // (and the greenery doubles as a faint "something's out here" hint through the fog).
  const around: { type: ResourceField['type']; off: number; ang: number; radius: number }[] = [
    { type: 'forest', off: 8, ang: 0.6, radius: 3.2 },
    { type: 'berryfield', off: 8, ang: 3.4, radius: 2.6 },
  ]
  for (const site of VILLAGE_SITES) {
    for (const a of around) {
      const x = site.x + Math.cos(a.ang) * a.off
      const z = site.z + Math.sin(a.ang) * a.off
      const field: ResourceField = { id: id++, type: a.type, pos: { x, z }, radius: a.radius }
      const count = a.type === 'forest' ? 15 : 12
      data.push({ field, clumps: scatter(r, x, z, a.radius, count) })
    }
  }

  // Orichalcum — the better metal — lies only in far, contested ground.
  // (1) a deposit inside the larger (tier 2+) village's territory, reached by
  //     TAKING that village (conquer / convert), then mining it.
  const orichSite = VILLAGE_SITES.find((v) => v.tier >= 2)
  if (orichSite) {
    const ox = orichSite.x + Math.cos(5.0) * 11
    const oz = orichSite.z + Math.sin(5.0) * 11
    const field: ResourceField = { id: id++, type: 'orichalcumdeposit', pos: { x: ox, z: oz }, radius: 2.7 }
    data.push({ field, clumps: scatter(r, ox, oz, 2.7, 7) })
  }
  // (2) a deposit out in empty, unclaimed wilderness — far from any village, so
  //     the only way to reach it is to FOUND a new settlement beside it.
  {
    const fx = Math.cos(4.0) * 72
    const fz = Math.sin(4.0) * 72
    const field: ResourceField = { id: id++, type: 'orichalcumdeposit', pos: { x: fx, z: fz }, radius: 2.8 }
    data.push({ field, clumps: scatter(r, fx, fz, 2.8, 8) })
  }
  return data
}

const DATA = build()

export const FIELDS: ResourceField[] = DATA.map((d) => d.field)
export const FIELD_CLUMPS: Record<number, Clump[]> = Object.fromEntries(
  DATA.map((d) => [d.field.id, d.clumps]),
)
