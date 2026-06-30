import { useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { DoubleSide, type Group, type Mesh, type MeshStandardMaterial } from 'three'
import { Html } from '@react-three/drei'
import { useGame } from '../game/store'
import { OWNED_COLOR, RESIDENCE_ERAS, SCOUT_UNLOCK_TIER, TOWN_TIERS } from '../game/config'
import type { NpcVillage } from '../game/types'
import { ResidenceModel } from './Residence'

const noHit = () => null
const FACTION = '#a23c3c' // banner / accent colour marking a neutral village
const TERRITORY_TINT = '#9fb0c8' // cool tint, distinct from the player's warm border
const OWNED_TINT = '#e6cf94' // warm gold tint for villages that have joined you

// one ambling NPC inhabitant; mirrors its live sim position onto the mesh
function NpcVillagerMesh({ villageId, index }: { villageId: number; index: number }) {
  const root = useRef<Group>(null)
  const last = useRef({ x: 0, z: 0 })
  useFrame((state) => {
    const village = useGame.getState().npcVillages.find((v) => v.id === villageId)
    const nv = village?.villagers[index]
    if (!nv || !root.current) return
    const t = state.clock.elapsedTime
    const moved = Math.hypot(nv.pos.x - last.current.x, nv.pos.z - last.current.z) > 0.003
    last.current.x = nv.pos.x
    last.current.z = nv.pos.z
    const y = moved ? Math.abs(Math.sin(t * 9 + nv.bob)) * 0.1 : 0
    // nv.pos is a world position, but this mesh lives inside a group already
    // translated to the village centre — subtract it so we stay local
    root.current.position.set(nv.pos.x - village.center.x, y, nv.pos.z - village.center.z)
    root.current.rotation.y = nv.heading
  })
  return (
    <group ref={root}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <capsuleGeometry args={[0.2, 0.4, 6, 12]} />
        <meshStandardMaterial color="#a8553f" />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color="#e8c39e" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={noHit}>
        <circleGeometry args={[0.26, 14]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.16} />
      </mesh>
    </group>
  )
}

function VillageCenter({ tierIndex, banner }: { tierIndex: number; banner: string }) {
  // a grander dwelling (one era up) plus a banner pole marks the hub
  const model = RESIDENCE_ERAS[Math.min(tierIndex + 1, RESIDENCE_ERAS.length - 1)].model
  return (
    <group>
      <group scale={1.4}>
        <ResidenceModel kind={model} />
      </group>
      <mesh position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 3.2, 6]} />
        <meshStandardMaterial color="#5a4632" />
      </mesh>
      <mesh position={[0.55, 2.7, 0]}>
        <planeGeometry args={[1.0, 0.55]} />
        <meshStandardMaterial color={banner} side={DoubleSide} />
      </mesh>
    </group>
  )
}

function SelectionRing() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} raycast={noHit}>
      <ringGeometry args={[1.9, 2.2, 36]} />
      <meshBasicMaterial color="#ffd166" transparent opacity={0.85} />
    </mesh>
  )
}

function NpcVillageView({ village, selected }: { village: NpcVillage; selected: boolean }) {
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (useGame.getState().buildMode !== 'none') return
    e.stopPropagation()
    useGame.getState().selectNpc(village.id)
  }
  const onOver = () => {
    if (useGame.getState().buildMode === 'none') document.body.style.cursor = 'pointer'
  }
  const onOut = () => (document.body.style.cursor = 'auto')
  const tier = TOWN_TIERS[village.tierIndex]
  const owned = village.owner === 'player'

  return (
    <group position={[village.center.x, 0, village.center.z]}>
      {/* claimed-ground tint — cool for neutral, warm gold once it's yours */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]} raycast={noHit}>
        <circleGeometry args={[village.territoryRadius, 48]} />
        <meshBasicMaterial
          color={owned ? OWNED_TINT : TERRITORY_TINT}
          transparent
          opacity={owned ? 0.14 : 0.1}
        />
      </mesh>

      {selected && <SelectionRing />}

      <group onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
        <VillageCenter tierIndex={village.tierIndex} banner={owned ? OWNED_COLOR : FACTION} />
      </group>

      {village.huts.map((h, i) => (
        <group key={i} position={[h.pos.x - village.center.x, 0, h.pos.z - village.center.z]} rotation={[0, h.rot, 0]}>
          <ResidenceModel kind={h.model} />
        </group>
      ))}

      {village.villagers.map((_, i) => (
        <NpcVillagerMesh key={i} villageId={village.id} index={i} />
      ))}

      <Html position={[0, 4.4, 0]} center occlude={false} style={{ pointerEvents: 'none' }}>
        <div className="npc-label">
          {village.name}
          <span>{tier.era}</span>
        </div>
      </Html>
    </group>
  )
}

// a drifting smoke plume that rises well above the ground-level fog, so distant
// settlements give themselves away as "smoke on the horizon" — a rough hint of
// where to scout, without revealing the village itself
const SMOKE_PUFFS = 9
function VillageSmoke({ x, z }: { x: number; z: number }) {
  const puffs = useRef<(Mesh | null)[]>([])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const m = puffs.current[i]
      if (!m) continue
      const phase = (t * 0.22 + i / SMOKE_PUFFS) % 1 // 0 (ground) -> 1 (top)
      const sway = 0.25 + phase * 1.0
      m.position.set(Math.sin(t * 0.6 + i * 1.7) * sway, 2 + phase * 15, Math.cos(t * 0.5 + i * 2.1) * sway)
      m.scale.setScalar(0.6 + phase * 1.5)
      ;(m.material as MeshStandardMaterial).opacity = 0.62 * Math.sin(phase * Math.PI)
    }
  })
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: SMOKE_PUFFS }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            puffs.current[i] = el
          }}
          raycast={noHit}
          renderOrder={4} // draw over the (transparent) fog plane
        >
          <sphereGeometry args={[0.85, 12, 10]} />
          <meshStandardMaterial color="#c4c9d2" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

export function NpcVillages() {
  const villages = useGame((s) => s.npcVillages)
  const selection = useGame((s) => s.selection)
  const tierIndex = useGame((s) => s.tierIndex)
  const selId = selection?.kind === 'npc' ? selection.id : -1
  // smoke hints appear once scouting unlocks; the village itself stays hidden
  // under the fog until a scout actually reaches it
  const hint = tierIndex >= SCOUT_UNLOCK_TIER
  return (
    <group>
      {villages.map((v) => (
        <group key={v.id}>
          {(v.discovered || hint) && <VillageSmoke x={v.center.x} z={v.center.z} />}
          {v.discovered && <NpcVillageView village={v} selected={v.id === selId} />}
        </group>
      ))}
    </group>
  )
}
