import { Fragment, useEffect, useMemo } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { MeshBasicMaterial } from 'three'
import {
  isProduction,
  nearestHub,
  prodLevel,
  productionUpgradeAvailable,
  roadConnected,
  useGame,
} from '../game/store'
import { RESIDENCE_ERAS } from '../game/config'
import type { Building, Vec2 } from '../game/types'
import { ResidenceModel, UpgradeBeacon } from './Residence'
import { ProductionModel } from './Production'

const noHit = () => null
const BEACON_Y: Record<string, number> = { leanto: 1.6, tent: 1.9, hut: 1.9, house: 2.1, cottage: 2.4 }

// glowing ring under the building the player has selected
function SelectionRing() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} raycast={noHit}>
      <ringGeometry args={[1.35, 1.6, 32]} />
      <meshBasicMaterial color="#ffd166" transparent opacity={0.85} />
    </mesh>
  )
}

function ResidenceView({ b, outdated, selected }: { b: Building; outdated: boolean; selected: boolean }) {
  const era = RESIDENCE_ERAS[b.level]
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (useGame.getState().buildMode !== 'none') return
    e.stopPropagation()
    useGame.getState().selectBuilding(b.id)
  }
  const onOver = () => {
    if (useGame.getState().buildMode === 'none') document.body.style.cursor = 'pointer'
  }
  const onOut = () => (document.body.style.cursor = 'auto')

  return (
    <group position={[b.pos.x, 0, b.pos.z]}>
      {selected && <SelectionRing />}
      <group rotation={[0, b.rot, 0]} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
        <ResidenceModel kind={era.model} />
      </group>
      {outdated && <UpgradeBeacon y={BEACON_Y[era.model] ?? 2} />}
    </group>
  )
}

function WorkerSlots({ filled, total }: { filled: number; total: number }) {
  const spacing = 0.34
  const start = -((total - 1) * spacing) / 2
  return (
    <group position={[0, 2.4, 0]}>
      {Array.from({ length: total }).map((_, i) => (
        <mesh key={i} position={[start + i * spacing, 0, 0]}>
          <sphereGeometry args={[0.12, 10, 10]} />
          <meshStandardMaterial
            color={i < filled ? '#7ad17a' : '#3c3c44'}
            emissive={i < filled ? '#2f6f2f' : '#000000'}
            emissiveIntensity={0.5}
          />
        </mesh>
      ))}
    </group>
  )
}

function ProductionView({ b, selected, canUpgrade }: { b: Building; selected: boolean; canUpgrade: boolean }) {
  const lvl = prodLevel(b)
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (useGame.getState().buildMode !== 'none') return
    e.stopPropagation()
    useGame.getState().selectBuilding(b.id)
  }
  const onOver = () => {
    if (useGame.getState().buildMode === 'none') document.body.style.cursor = 'pointer'
  }
  const onOut = () => (document.body.style.cursor = 'auto')
  if (!isProduction(b) || !lvl) return null

  return (
    <group position={[b.pos.x, 0, b.pos.z]}>
      {selected && <SelectionRing />}
      <group rotation={[0, b.rot, 0]} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
        <ProductionModel kind={b.kind} level={b.level} />
      </group>
      <WorkerSlots filled={b.workers.length} total={lvl.slots} />
      {canUpgrade && <UpgradeBeacon y={2.9} />}
    </group>
  )
}

// faint dashed line from an un-roaded workplace toward its nearest hub
function NoRoadHint({ from, to }: { from: Vec2; to: Vec2 }) {
  const mat = useMemo(
    () => new MeshBasicMaterial({ color: '#e6b566', transparent: true, depthWrite: false }),
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  const dashes = useMemo(() => {
    const dx = to.x - from.x
    const dz = to.z - from.z
    const len = Math.hypot(dx, dz)
    const step = 0.95
    const out: number[] = []
    for (let d = 1.6; d < len - 1.6; d += step) out.push(d)
    return { angle: Math.atan2(dz, dx), positions: out }
  }, [from.x, from.z, to.x, to.z])

  useFrame((s) => {
    mat.opacity = 0.22 + (Math.sin(s.clock.elapsedTime * 2) + 1) * 0.11
  })

  return (
    <group position={[from.x, 0.05, from.z]} rotation={[0, -dashes.angle, 0]}>
      {dashes.positions.map((d, i) => (
        <mesh key={i} position={[d, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat} raycast={noHit}>
          <planeGeometry args={[0.5, 0.14]} />
        </mesh>
      ))}
    </group>
  )
}

export function Buildings() {
  const buildings = useGame((s) => s.buildings)
  const paths = useGame((s) => s.paths)
  const tierIndex = useGame((s) => s.tierIndex)
  const npcVillages = useGame((s) => s.npcVillages)
  const selection = useGame((s) => s.selection)
  const selId = selection?.kind === 'building' ? selection.id : -1

  return (
    <group>
      {buildings.map((b) => {
        if (!isProduction(b))
          return (
            <ResidenceView
              key={b.id}
              b={b}
              outdated={b.level < tierIndex}
              selected={b.id === selId}
            />
          )
        const hub = nearestHub(b.pos, npcVillages)
        return (
          <Fragment key={b.id}>
            <ProductionView
              b={b}
              selected={b.id === selId}
              canUpgrade={productionUpgradeAvailable(b, tierIndex)}
            />
            {!roadConnected(b.pos, paths, hub) && <NoRoadHint from={b.pos} to={hub} />}
          </Fragment>
        )
      })}
    </group>
  )
}
