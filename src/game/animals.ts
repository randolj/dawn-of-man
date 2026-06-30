import type { Animal } from './types'

// Deterministic deer herds roaming near the starting area. They graze and amble
// within a loose home range; a Hunter's Lodge's workers chase and kill them for
// meat, after which they respawn elsewhere. Ambient world life, not persisted.

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

// herds sit between the resource fields, near enough to reach from town
const HERDS: { angle: number; dist: number; count: number }[] = [
  { angle: 1.0, dist: 20, count: 3 },
  { angle: 3.0, dist: 26, count: 4 },
  { angle: 5.0, dist: 22, count: 3 },
]

let nextAnimalId = 1

export function makeAnimals(): Animal[] {
  const r = rng(909)
  const out: Animal[] = []
  for (const h of HERDS) {
    const hx = Math.cos(h.angle) * h.dist
    const hz = Math.sin(h.angle) * h.dist
    for (let i = 0; i < h.count; i++) {
      const a = r() * Math.PI * 2
      const rad = r() * 4
      const home = { x: hx + Math.cos(a) * rad, z: hz + Math.sin(a) * rad }
      out.push({
        id: nextAnimalId++,
        pos: { x: home.x, z: home.z },
        heading: r() * Math.PI * 2,
        wanderTarget: null,
        home,
        restTimer: r() * 3,
        alive: true,
        respawnTimer: 0,
        hits: 0,
        bob: r() * 6,
      })
    }
  }
  return out
}
