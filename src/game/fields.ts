import type { ResourceField } from './types'

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
  return data
}

const DATA = build()

export const FIELDS: ResourceField[] = DATA.map((d) => d.field)
export const FIELD_CLUMPS: Record<number, Clump[]> = Object.fromEntries(
  DATA.map((d) => [d.field.id, d.clumps]),
)
