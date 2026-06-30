// Deterministic decorative landscape: mountains on the horizon, scattered trees,
// rocks and grass tufts. Generated once from a fixed seed so the world looks
// hand-placed and stays identical across reloads. None of this is interactive.

export interface Tree {
  x: number
  z: number
  scale: number
  /** small palette variation */
  tone: number
  kind: 'pine' | 'round'
}

export interface Mountain {
  x: number
  z: number
  radius: number
  height: number
  snow: boolean
}

export interface Rock {
  x: number
  z: number
  scale: number
  rot: number
}

// mulberry32 — tiny seeded PRNG so generation is deterministic
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

export const WORLD_RADIUS = 140
const INNER_KEEPOUT = 12 // leave the starting play area clear of decoration

function build() {
  const r = rng(1337)
  const trees: Tree[] = []
  const mountains: Mountain[] = []
  const rocks: Rock[] = []

  // --- mountains ring the far edge of the world ---
  const mountainCount = 22
  for (let i = 0; i < mountainCount; i++) {
    const a = (i / mountainCount) * Math.PI * 2 + (r() - 0.5) * 0.25
    const dist = 110 + r() * 22
    const height = 11 + r() * 15
    mountains.push({
      x: Math.cos(a) * dist,
      z: Math.sin(a) * dist,
      radius: 9 + r() * 9,
      height,
      snow: height > 16,
    })
  }

  // --- decorative trees scattered across the mid/outer field ---
  const treeCount = 150
  let placed = 0
  let guard = 0
  while (placed < treeCount && guard < 4000) {
    guard++
    const a = r() * Math.PI * 2
    const dist = INNER_KEEPOUT + r() * (WORLD_RADIUS - INNER_KEEPOUT - 12)
    const x = Math.cos(a) * dist
    const z = Math.sin(a) * dist
    trees.push({
      x,
      z,
      scale: 0.7 + r() * 1.1,
      tone: r(),
      kind: r() > 0.45 ? 'pine' : 'round',
    })
    placed++
  }

  // --- rocks ---
  const rockCount = 50
  for (let i = 0; i < rockCount; i++) {
    const a = r() * Math.PI * 2
    const dist = INNER_KEEPOUT + r() * (WORLD_RADIUS - INNER_KEEPOUT - 8)
    rocks.push({
      x: Math.cos(a) * dist,
      z: Math.sin(a) * dist,
      scale: 0.4 + r() * 1.0,
      rot: r() * Math.PI * 2,
    })
  }

  return { trees, mountains, rocks }
}

export const SCENERY = build()
