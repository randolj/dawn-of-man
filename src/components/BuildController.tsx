import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { MeshStandardMaterial, type Group, type Mesh } from 'three'
import { snapPathPoint, useGame } from '../game/store'
import { PRODUCTION, RESIDENCE_ERAS, RESIDENCE_HALF, PATH_WIDTH } from '../game/config'
import { WORLD_RADIUS } from '../game/scenery'
import { FIELDS } from '../game/fields'
import { ResidenceModel } from './Residence'
import { ProductionModel } from './Production'

type Controls = { enabled: boolean } | null

export function BuildController() {
  const controls = useThree((s) => s.controls) as Controls
  const buildMode = useGame((s) => s.buildMode)

  useEffect(() => {
    const onUp = () => {
      const g = useGame.getState()
      if (g.heldId !== null) {
        g.dropHeld()
        document.body.style.cursor = 'auto'
        if (controls) controls.enabled = true
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const g = useGame.getState()
        if (g.heldId !== null) onUp()
        g.endPath()
        g.clearSelection()
        g.setBuildMode('none')
      }
    }
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [controls])

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const g = useGame.getState()
    const p = { x: e.point.x, z: e.point.z }
    g.setCursorGround(p)
    if (g.heldId !== null) g.moveHeld(p)

    // tooltip: which natural field (if any) is under the cursor?
    const field = FIELDS.find((f) => Math.hypot(p.x - f.pos.x, p.z - f.pos.z) <= f.radius)
    const ne = e.nativeEvent as PointerEvent
    if (field) g.setHover({ fieldId: field.id, x: ne.clientX, y: ne.clientY })
    else if (g.hover) g.setHover(null)
  }

  const onLeave = () => useGame.getState().setHover(null)

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const g = useGame.getState()
    const p = { x: e.point.x, z: e.point.z }
    if (g.buildMode === 'house') g.placeResidence(p)
    else if (g.buildMode === 'lumberyard') g.placeProduction(p, 'lumberyard')
    else if (g.buildMode === 'forager') g.placeProduction(p, 'forager')
    else if (g.buildMode === 'quarry') g.placeProduction(p, 'quarry')
    else if (g.buildMode === 'hunter') g.placeProduction(p, 'hunter')
    else if (g.buildMode === 'mine') g.placeProduction(p, 'mine')
    else if (g.buildMode === 'smithy') g.placeProduction(p, 'smithy')
    else if (g.buildMode === 'scout') {
      g.sendScoutTo(p)
      g.setBuildMode('none')
    } else if (g.buildMode === 'path') g.addPathPoint(p)
    else {
      // click a forest / berry field to send a villager on ONE manual gather
      // trip (each trip is hand-triggered); otherwise click empty ground to deselect
      const field = FIELDS.find((f) => Math.hypot(p.x - f.pos.x, p.z - f.pos.z) <= f.radius)
      if (field) g.gatherField(field.id)
      else if (g.selection) g.clearSelection()
    }
  }

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        onPointerMove={onMove}
        onPointerOut={onLeave}
        onClick={onClick}
      >
        <circleGeometry args={[WORLD_RADIUS, 64]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {buildMode === 'house' && <ResidenceGhost />}
      {(buildMode === 'lumberyard' ||
        buildMode === 'forager' ||
        buildMode === 'quarry' ||
        buildMode === 'hunter' ||
        buildMode === 'mine' ||
        buildMode === 'smithy') && <ProductionGhost kind={buildMode} />}
      {buildMode === 'path' && <PathGhost />}
      {buildMode === 'scout' && <ScoutGhost />}
    </group>
  )
}

// a target reticle that follows the cursor while choosing where to scout
function ScoutGhost() {
  const root = useRef<Group>(null)
  useFrame(() => {
    const c = useGame.getState().cursorGround
    if (root.current) root.current.position.set(c.x, 0.06, c.z)
  })
  return (
    <group ref={root}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.3, 1.7, 32]} />
        <meshBasicMaterial color="#9fd8ff" transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.34, 20]} />
        <meshBasicMaterial color="#9fd8ff" transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

function useGhostMaterial() {
  const material = useMemo(
    () => new MeshStandardMaterial({ transparent: true, opacity: 0.5, depthWrite: false }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}

function ResidenceGhost() {
  const root = useRef<Group>(null)
  const tierIndex = useGame((s) => s.tierIndex)
  const era = RESIDENCE_ERAS[tierIndex]
  const material = useGhostMaterial()

  useFrame(() => {
    const g = useGame.getState()
    if (!root.current) return
    const c = g.cursorGround
    root.current.position.set(c.x, 0, c.z)
    root.current.rotation.y = Math.atan2(-c.x, -c.z)
    const ok = !g.atBuildCap() && g.canAfford(era.buildCost) && g.canPlaceAt(c, RESIDENCE_HALF)
    material.color.set(ok ? '#6fe06f' : '#e06f6f')
  })

  return (
    <group ref={root}>
      <ResidenceModel kind={era.model} material={material} />
    </group>
  )
}

function ProductionGhost({
  kind,
}: {
  kind: 'lumberyard' | 'forager' | 'quarry' | 'hunter' | 'mine' | 'smithy'
}) {
  const root = useRef<Group>(null)
  const material = useGhostMaterial()
  const def = PRODUCTION[kind]

  useFrame(() => {
    const g = useGame.getState()
    if (!root.current) return
    const c = g.cursorGround
    root.current.position.set(c.x, 0, c.z)
    root.current.rotation.y = Math.atan2(-c.x, -c.z)
    const ok = !g.atBuildCap() && g.canAfford(def.cost) && g.canPlaceProduction(c, kind)
    material.color.set(ok ? '#6fe06f' : '#e06f6f')
  })

  return (
    <group ref={root}>
      <ProductionModel kind={kind} level={0} material={material} />
    </group>
  )
}

function PathGhost() {
  const marker = useRef<Mesh>(null)
  const markerMat = useRef<MeshStandardMaterial>(null)
  const ring = useRef<Mesh>(null)
  const band = useRef<Group>(null)
  const bandMesh = useRef<Mesh>(null)

  useFrame(() => {
    const g = useGame.getState()
    // snap the previewed point to a nearby key spot (townhall / building)
    const snap = snapPathPoint(g.cursorGround, g.buildings)
    const c = snap.point
    if (marker.current) marker.current.position.set(c.x, 0.04, c.z)
    // marker turns green when it's locked onto a snap target
    if (markerMat.current) markerMat.current.color.set(snap.target ? '#7cff8a' : '#ffe08a')
    if (ring.current) {
      ring.current.visible = snap.target !== null
      if (snap.target) ring.current.position.set(snap.target.x, 0.05, snap.target.z)
    }

    const draft = g.pathDraft
    if (band.current && bandMesh.current) {
      if (draft.length > 0) {
        const a = draft[draft.length - 1]
        const dx = c.x - a.x
        const dz = c.z - a.z
        const len = Math.hypot(dx, dz)
        band.current.visible = len > 0.05
        band.current.position.set((a.x + c.x) / 2, 0.035, (a.z + c.z) / 2)
        band.current.rotation.y = -Math.atan2(dz, dx)
        bandMesh.current.scale.x = len
      } else {
        band.current.visible = false
      }
    }
  })

  return (
    <group>
      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[PATH_WIDTH / 2 + 0.1, 16]} />
        <meshStandardMaterial ref={markerMat} color="#ffe08a" transparent opacity={0.8} />
      </mesh>
      {/* reticle over the spot a road point will snap onto */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[1.4, 1.8, 32]} />
        <meshBasicMaterial color="#7cff8a" transparent opacity={0.85} />
      </mesh>
      <group ref={band} visible={false}>
        <mesh ref={bandMesh} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1, PATH_WIDTH]} />
          <meshStandardMaterial color="#ffe08a" transparent opacity={0.5} />
        </mesh>
      </group>
    </group>
  )
}
