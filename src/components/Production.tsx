import type { Material } from 'three'
import { Part } from './Residence'

type M = { material?: Material }

// --- lumberyard line: Sawmill -> Shed -> Lumberyard -> Mill --------------------
function LogPile({ material }: M) {
  return (
    <group position={[1.15, 0, 0.3]}>
      <Part position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]} color="#b07a44" material={material}>
        <cylinderGeometry args={[0.16, 0.16, 1.2, 8]} />
      </Part>
      <Part position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]} color="#a06c3c" material={material}>
        <cylinderGeometry args={[0.16, 0.16, 1.2, 8]} />
      </Part>
      <Part position={[0.17, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]} color="#b07a44" material={material}>
        <cylinderGeometry args={[0.16, 0.16, 1.2, 8]} />
      </Part>
    </group>
  )
}

function Sawmill({ material }: M) {
  return (
    <group>
      {/* saw bench */}
      <Part position={[0, 0.4, 0]} color="#8a6a44" material={material} flat={false}>
        <boxGeometry args={[1.3, 0.18, 0.7]} />
      </Part>
      <Part position={[-0.5, 0.2, 0.25]} color="#6b4a2b" material={material}>
        <cylinderGeometry args={[0.05, 0.05, 0.4, 6]} />
      </Part>
      <Part position={[0.5, 0.2, -0.25]} color="#6b4a2b" material={material}>
        <cylinderGeometry args={[0.05, 0.05, 0.4, 6]} />
      </Part>
      {/* circular saw blade */}
      <Part position={[0.15, 0.6, 0]} rotation={[0, 0, Math.PI / 2]} color="#aab0b8" material={material}>
        <cylinderGeometry args={[0.34, 0.34, 0.04, 16]} />
      </Part>
      {/* a log being cut */}
      <Part position={[-0.3, 0.58, 0]} rotation={[Math.PI / 2, 0, 0]} color="#b07a44" material={material}>
        <cylinderGeometry args={[0.13, 0.13, 0.7, 8]} />
      </Part>
    </group>
  )
}

function LumberShed({ material }: M) {
  return (
    <group>
      {/* four posts */}
      {[[-0.8, -0.7], [0.8, -0.7], [-0.8, 0.7], [0.8, 0.7]].map(([x, z], i) => (
        <Part key={i} position={[x, 0.5, z]} color="#6b4a2b" material={material}>
          <cylinderGeometry args={[0.08, 0.08, 1, 6]} />
        </Part>
      ))}
      {/* slanted plank roof */}
      <Part position={[0, 1.05, 0]} rotation={[0.14, 0, 0]} color="#5e4326" material={material}>
        <boxGeometry args={[2, 0.12, 1.8]} />
      </Part>
      <LogPile material={material} />
    </group>
  )
}

function Lumberyard({ material }: M) {
  return (
    <group>
      <Part position={[0, 0.5, 0]} color="#8a6a44" material={material} flat={false}>
        <boxGeometry args={[1.8, 1.0, 1.5]} />
      </Part>
      <Part position={[0, 1.18, 0]} rotation={[0.12, 0, 0]} color="#5e4326" material={material}>
        <boxGeometry args={[2.0, 0.12, 1.8]} />
      </Part>
      <LogPile material={material} />
    </group>
  )
}

function LumberMill({ material }: M) {
  return (
    <group>
      <Part position={[0, 0.6, 0]} color="#9a7250" material={material} flat={false}>
        <boxGeometry args={[2.0, 1.2, 1.7]} />
      </Part>
      <Part position={[0, 1.45, 0]} rotation={[0, Math.PI / 4, 0]} color="#5e4326" material={material}>
        <coneGeometry args={[1.7, 0.8, 4]} />
      </Part>
      {/* water wheel on the side */}
      <Part position={[-1.15, 0.55, 0]} rotation={[0, 0, 0]} color="#6b4a2b" material={material}>
        <cylinderGeometry args={[0.6, 0.6, 0.18, 12]} />
      </Part>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Part
          key={i}
          position={[-1.15, 0.55, 0]}
          rotation={[(i * Math.PI) / 3, 0, 0]}
          color="#83633f"
          material={material}
        >
          <boxGeometry args={[0.24, 1.2, 0.14]} />
        </Part>
      ))}
    </group>
  )
}

// --- forager line: Foraging Spot -> Hut -> Lodge -> Farmstead ------------------
function Basket({ material, x = 0.9, z = 0.5 }: M & { x?: number; z?: number }) {
  return (
    <group position={[x, 0, z]}>
      <Part position={[0, 0.2, 0]} color="#9c6b3a" material={material}>
        <cylinderGeometry args={[0.3, 0.24, 0.34, 10]} />
      </Part>
      <Part position={[0, 0.4, 0]} color="#c0392b" material={material}>
        <sphereGeometry args={[0.26, 10, 8]} />
      </Part>
    </group>
  )
}

function ForagingSpot({ material }: M) {
  return (
    <group>
      {/* table */}
      <Part position={[0, 0.5, 0]} color="#9a7a52" material={material} flat={false}>
        <boxGeometry args={[1.2, 0.12, 0.7]} />
      </Part>
      {[[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].map(([x, z], i) => (
        <Part key={i} position={[x, 0.25, z]} color="#6b4a2b" material={material}>
          <cylinderGeometry args={[0.05, 0.05, 0.5, 6]} />
        </Part>
      ))}
      <Basket material={material} x={0.0} z={0.0} />
    </group>
  )
}

function ForagerHut({ material }: M) {
  return (
    <group>
      <Part position={[0, 0.42, 0]} color="#c2a06a" material={material}>
        <cylinderGeometry args={[0.78, 0.84, 0.84, 9]} />
      </Part>
      <Part position={[0, 1.05, 0]} color="#8a7a3a" material={material}>
        <coneGeometry args={[1.02, 0.7, 9]} />
      </Part>
      <Basket material={material} />
    </group>
  )
}

function GatheringLodge({ material }: M) {
  return (
    <group>
      <Part position={[0, 0.5, 0]} color="#c2a06a" material={material}>
        <cylinderGeometry args={[1.0, 1.06, 1.0, 10]} />
      </Part>
      <Part position={[0, 1.3, 0]} color="#8a7a3a" material={material}>
        <coneGeometry args={[1.28, 0.9, 10]} />
      </Part>
      <Basket material={material} x={1.15} z={0.4} />
      <Basket material={material} x={0.9} z={-0.6} />
    </group>
  )
}

function Farmstead({ material }: M) {
  return (
    <group>
      <Part position={[0, 0.5, 0]} color="#d8c8a8" material={material} flat={false}>
        <boxGeometry args={[1.5, 1.0, 1.3]} />
      </Part>
      <Part position={[0, 1.2, 0]} rotation={[0, Math.PI / 4, 0]} color="#9c7a3a" material={material}>
        <coneGeometry args={[1.25, 0.7, 4]} />
      </Part>
      {/* tilled crop rows out front */}
      {[-0.4, 0, 0.4].map((x, i) => (
        <Part
          key={i}
          position={[x + 0.2, 0.06, 1.3]}
          rotation={[-Math.PI / 2, 0, 0]}
          color="#6f9a47"
          material={material}
        >
          <planeGeometry args={[0.22, 1.4]} />
        </Part>
      ))}
    </group>
  )
}

const LUMBER = [Sawmill, LumberShed, Lumberyard, LumberMill]
const FORAGE = [ForagingSpot, ForagerHut, GatheringLodge, Farmstead]

export function ProductionModel({
  kind,
  level,
  material,
}: {
  kind: 'lumberyard' | 'forager'
  level: number
  material?: Material
}) {
  const list = kind === 'lumberyard' ? LUMBER : FORAGE
  const Comp = list[Math.min(level, list.length - 1)]
  return <Comp material={material} />
}
