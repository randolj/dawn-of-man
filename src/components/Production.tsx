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

// --- quarry line: Dig Site -> Quarry -> Stoneworks -> Great Quarry -----------
function StoneBlocks({ material, x = 1.1, z = 0.3 }: M & { x?: number; z?: number }) {
  return (
    <group position={[x, 0, z]}>
      <Part position={[0, 0.2, 0]} color="#9aa3ad" material={material}>
        <boxGeometry args={[0.5, 0.4, 0.5]} />
      </Part>
      <Part position={[0.12, 0.55, 0.06]} color="#8a929b" material={material}>
        <boxGeometry args={[0.4, 0.3, 0.4]} />
      </Part>
    </group>
  )
}

function DigSite({ material }: M) {
  return (
    <group>
      {/* shallow pit rim */}
      <Part position={[0, 0.12, 0]} color="#7e766c" material={material}>
        <cylinderGeometry args={[1.0, 1.12, 0.24, 10]} />
      </Part>
      {/* exposed boulder being worked */}
      <Part position={[0, 0.34, 0]} rotation={[0.3, 0.6, 0]} color="#9aa3ad" material={material}>
        <boxGeometry args={[0.7, 0.6, 0.7]} />
      </Part>
      {/* a pick leaning against it */}
      <Part position={[-0.6, 0.5, 0.3]} rotation={[0, 0, 0.5]} color="#6b4a2b" material={material}>
        <cylinderGeometry args={[0.04, 0.04, 1.0, 6]} />
      </Part>
      <StoneBlocks material={material} x={0.95} z={-0.4} />
    </group>
  )
}

function Quarry({ material }: M) {
  return (
    <group>
      {/* stone-walled shed */}
      <Part position={[0, 0.45, 0]} color="#8f98a1" material={material}>
        <boxGeometry args={[1.3, 0.9, 1.1]} />
      </Part>
      <Part position={[0, 1.0, 0]} rotation={[0, Math.PI / 4, 0]} color="#6f767d" material={material}>
        <coneGeometry args={[1.05, 0.5, 4]} />
      </Part>
      <StoneBlocks material={material} />
    </group>
  )
}

function Stoneworks({ material }: M) {
  return (
    <group>
      <Part position={[0, 0.55, 0]} color="#9aa3ad" material={material} flat={false}>
        <boxGeometry args={[1.7, 1.1, 1.3]} />
      </Part>
      <Part position={[0, 1.25, 0]} color="#6f767d" material={material}>
        <boxGeometry args={[1.85, 0.2, 1.45]} />
      </Part>
      {/* chimney */}
      <Part position={[0.6, 1.55, 0]} color="#5e636a" material={material}>
        <boxGeometry args={[0.3, 0.7, 0.3]} />
      </Part>
      <StoneBlocks material={material} x={1.25} z={0.4} />
      <StoneBlocks material={material} x={1.0} z={-0.6} />
    </group>
  )
}

function GreatQuarry({ material }: M) {
  return (
    <group>
      <Part position={[0, 0.7, 0]} color="#aab2bb" material={material} flat={false}>
        <boxGeometry args={[2.0, 1.4, 1.5]} />
      </Part>
      <Part position={[0, 1.52, 0]} color="#6f767d" material={material}>
        <boxGeometry args={[2.15, 0.22, 1.65]} />
      </Part>
      <Part position={[-0.7, 1.85, 0]} color="#5e636a" material={material}>
        <boxGeometry args={[0.34, 0.8, 0.34]} />
      </Part>
      <StoneBlocks material={material} x={1.45} z={0.5} />
      <StoneBlocks material={material} x={1.2} z={-0.7} />
      <StoneBlocks material={material} x={-1.35} z={0.6} />
    </group>
  )
}

// --- hunter line: Hunting Camp -> Lodge -> Game Lodge -> Great Lodge ---------
function HideRack({ material, x = 1.1, z = 0.2 }: M & { x?: number; z?: number }) {
  return (
    <group position={[x, 0, z]}>
      {/* two posts + a crossbar with a stretched hide */}
      <Part position={[-0.35, 0.5, 0]} color="#6b4a2b" material={material}>
        <cylinderGeometry args={[0.05, 0.05, 1, 6]} />
      </Part>
      <Part position={[0.35, 0.5, 0]} color="#6b4a2b" material={material}>
        <cylinderGeometry args={[0.05, 0.05, 1, 6]} />
      </Part>
      <Part position={[0, 0.7, 0]} color="#8a5a3a" material={material}>
        <boxGeometry args={[0.78, 0.5, 0.04]} />
      </Part>
    </group>
  )
}

function Antlers({ material, x = 0, z = 0.6 }: M & { x?: number; z?: number }) {
  return (
    <group position={[x, 1.0, z]}>
      <Part position={[-0.18, 0.1, 0]} rotation={[0, 0, 0.5]} color="#d8cdb6" material={material}>
        <coneGeometry args={[0.05, 0.5, 5]} />
      </Part>
      <Part position={[0.18, 0.1, 0]} rotation={[0, 0, -0.5]} color="#d8cdb6" material={material}>
        <coneGeometry args={[0.05, 0.5, 5]} />
      </Part>
    </group>
  )
}

function HuntingCamp({ material }: M) {
  return (
    <group>
      {/* a simple hide teepee */}
      <Part position={[0, 0.7, 0]} color="#9a6a44" material={material}>
        <coneGeometry args={[0.85, 1.5, 7]} />
      </Part>
      <HideRack material={material} x={1.0} z={0.1} />
    </group>
  )
}

function HunterLodge({ material }: M) {
  return (
    <group>
      <Part position={[0, 0.45, 0]} color="#7a5230" material={material}>
        <boxGeometry args={[1.3, 0.9, 1.0]} />
      </Part>
      <Part position={[0, 1.0, 0]} rotation={[0, Math.PI / 4, 0]} color="#5e4326" material={material}>
        <coneGeometry args={[1.0, 0.6, 4]} />
      </Part>
      <Antlers material={material} x={0} z={0.55} />
      <HideRack material={material} />
    </group>
  )
}

function GameLodge({ material }: M) {
  return (
    <group>
      <Part position={[0, 0.55, 0]} color="#7a5230" material={material} flat={false}>
        <boxGeometry args={[1.7, 1.1, 1.2]} />
      </Part>
      <Part position={[0, 1.25, 0]} rotation={[0, Math.PI / 4, 0]} color="#5e4326" material={material}>
        <coneGeometry args={[1.35, 0.7, 4]} />
      </Part>
      <Antlers material={material} x={0} z={0.7} />
      <HideRack material={material} x={1.25} z={0.3} />
      <HideRack material={material} x={1.0} z={-0.6} />
    </group>
  )
}

function GreatLodge({ material }: M) {
  return (
    <group>
      <Part position={[0, 0.7, 0]} color="#83592f" material={material} flat={false}>
        <boxGeometry args={[2.0, 1.4, 1.4]} />
      </Part>
      <Part position={[0, 1.55, 0]} rotation={[0, Math.PI / 4, 0]} color="#5e4326" material={material}>
        <coneGeometry args={[1.6, 0.85, 4]} />
      </Part>
      <Antlers material={material} x={0} z={0.85} />
      <HideRack material={material} x={1.45} z={0.4} />
      <HideRack material={material} x={1.2} z={-0.7} />
    </group>
  )
}

// --- mithril mine: an earthen adit with glinting ore chunks, grows by level
const MITHRIL_ORE = '#86a9b2'
function MineModel({ level, material }: M & { level: number }) {
  const ore = MITHRIL_ORE
  const s = 1 + level * 0.18
  return (
    <group scale={s}>
      <Part position={[0, 0.4, -0.1]} color="#8a7457" material={material}>
        <cylinderGeometry args={[0.85, 1.05, 0.8, 8]} />
      </Part>
      <Part position={[0, 0.34, 0.55]} color="#241d16" material={material}>
        <boxGeometry args={[0.5, 0.58, 0.4]} />
      </Part>
      <Part position={[-0.3, 0.5, 0.75]} color="#5e4326" material={material}>
        <cylinderGeometry args={[0.05, 0.05, 0.7, 6]} />
      </Part>
      <Part position={[0.3, 0.5, 0.75]} color="#5e4326" material={material}>
        <cylinderGeometry args={[0.05, 0.05, 0.7, 6]} />
      </Part>
      <Part position={[0.9, 0.2, 0.45]} color={ore} material={material}>
        <dodecahedronGeometry args={[0.27, 0]} />
      </Part>
      <Part position={[1.05, 0.16, -0.05]} color={ore} material={material}>
        <dodecahedronGeometry args={[0.19, 0]} />
      </Part>
    </group>
  )
}

// --- smithy line: Smithy -> Armory (forge mithril into weapons) --------------
function Smithy({ material }: M) {
  return (
    <group>
      {/* stone forge with a glowing mouth + chimney */}
      <Part position={[0, 0.45, 0]} color="#5e5751" material={material}>
        <boxGeometry args={[1.2, 0.9, 1.0]} />
      </Part>
      <Part position={[0.4, 1.25, 0]} color="#4a4540" material={material}>
        <cylinderGeometry args={[0.14, 0.18, 0.9, 8]} />
      </Part>
      <Part position={[0, 0.4, 0.52]} color="#ff8a3a" material={material}>
        <boxGeometry args={[0.36, 0.42, 0.08]} />
      </Part>
      {/* anvil out front */}
      <Part position={[0.95, 0.32, 0.4]} color="#3a3d42" material={material}>
        <boxGeometry args={[0.5, 0.22, 0.26]} />
      </Part>
      <Part position={[0.95, 0.16, 0.4]} color="#3a3d42" material={material}>
        <boxGeometry args={[0.18, 0.2, 0.18]} />
      </Part>
    </group>
  )
}

function Armory({ material }: M) {
  return (
    <group>
      <Part position={[0, 0.6, 0]} color="#5e5751" material={material} flat={false}>
        <boxGeometry args={[1.6, 1.2, 1.2]} />
      </Part>
      <Part position={[0.5, 1.6, 0.25]} color="#4a4540" material={material}>
        <cylinderGeometry args={[0.16, 0.2, 1.0, 8]} />
      </Part>
      <Part position={[0.5, 1.5, -0.3]} color="#4a4540" material={material}>
        <cylinderGeometry args={[0.13, 0.17, 0.8, 8]} />
      </Part>
      <Part position={[0, 0.5, 0.62]} color="#ff8a3a" material={material}>
        <boxGeometry args={[0.4, 0.5, 0.08]} />
      </Part>
      {/* weapon rack: a few spears */}
      {[-0.2, 0, 0.2].map((x, i) => (
        <Part key={i} position={[-0.95, 0.7, x]} color="#9aa3ad" material={material}>
          <cylinderGeometry args={[0.03, 0.03, 1.3, 5]} />
        </Part>
      ))}
    </group>
  )
}

const LUMBER = [Sawmill, LumberShed, Lumberyard, LumberMill]
const FORAGE = [ForagingSpot, ForagerHut, GatheringLodge, Farmstead]
const QUARRY = [DigSite, Quarry, Stoneworks, GreatQuarry]
const HUNTER = [HuntingCamp, HunterLodge, GameLodge, GreatLodge]
const SMITHY = [Smithy, Armory]

export function ProductionModel({
  kind,
  level,
  material,
}: {
  kind: 'lumberyard' | 'forager' | 'quarry' | 'hunter' | 'mine' | 'orichalcummine' | 'smithy' | 'starforge'
  level: number
  material?: Material
}) {
  // the orichalcum mine reuses the mine model — the golden ore it sits on sets it apart
  if (kind === 'mine' || kind === 'orichalcummine') return <MineModel level={level} material={material} />
  const list =
    kind === 'lumberyard'
      ? LUMBER
      : kind === 'forager'
        ? FORAGE
        : kind === 'quarry'
          ? QUARRY
          : kind === 'hunter'
            ? HUNTER
            : SMITHY
  const Comp = list[Math.min(level, list.length - 1)]
  return <Comp material={material} />
}
