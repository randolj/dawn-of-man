import { useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import { useGame } from '../game/store'
import { FIELDS } from '../game/fields'
import { RESOURCE_COLORS, HELD_HEIGHT } from '../game/config'

type Controls = { enabled: boolean } | null

export function Villager({ villagerId }: { villagerId: number }) {
  const root = useRef<Group>(null)
  const lean = useRef<Group>(null)
  const carryMesh = useRef<Mesh>(null)
  const axe = useRef<Group>(null)
  const spear = useRef<Group>(null)
  const shadow = useRef<Mesh>(null)
  const lastPos = useRef({ x: 0, z: 0 })
  const controls = useThree((s) => s.controls) as Controls

  useFrame((state) => {
    const g = useGame.getState()
    const v = g.villagers.find((x) => x.id === villagerId)
    if (!v || !root.current) return

    const t = state.clock.elapsedTime
    // hide your own body while you ARE this villager (first-person refounding)
    const isSurvivor = g.refounding != null && g.refounding.survivorId === v.id
    root.current.visible = !isSurvivor
    if (isSurvivor) return
    const held = v.state === 'held'
    const working = v.state === 'working'
    // soldiers (war parties) AND defenders (repelling a raid) carry a spear
    const soldier = v.state === 'marching' || v.state === 'fighting' || v.state === 'defending'
    const fighting = v.state === 'fighting' || v.state === 'defending'
    // bob whenever actually moving (covers walking, hauling AND idle wandering)
    const moved = Math.hypot(v.pos.x - lastPos.current.x, v.pos.z - lastPos.current.z) > 0.003
    lastPos.current.x = v.pos.x
    lastPos.current.z = v.pos.z

    let y = 0
    if (held) y = HELD_HEIGHT + Math.sin(t * 4) * 0.08
    else if (moved) y = Math.abs(Math.sin(t * 9 + v.bob)) * 0.12
    root.current.position.set(v.pos.x, y, v.pos.z)
    root.current.rotation.y = v.heading
    root.current.rotation.z = held ? Math.sin(t * 3 + v.bob) * 0.12 : 0

    if (lean.current) {
      if (working || fighting) {
        const swing = (Math.sin(t * (fighting ? 14 : 12) + v.bob) + 1) * 0.5
        lean.current.rotation.x = 0.12 + swing * (fighting ? 0.32 : 0.5)
      } else {
        lean.current.rotation.x += (0 - lean.current.rotation.x) * 0.25
      }
    }

    // a spear in hand while marching to or fighting at a village; jabs in melee
    if (spear.current) {
      spear.current.visible = soldier
      spear.current.rotation.x = fighting ? Math.sin(t * 13 + v.bob) * 0.3 : 0
    }

    // axe when producing wood — at a lumberyard or chopping a forest by hand
    if (axe.current) {
      const atLumberyard =
        v.workplaceId != null &&
        g.buildings.find((b) => b.id === v.workplaceId)?.kind === 'lumberyard'
      const choppingForest =
        v.forageFieldId != null &&
        FIELDS.find((f) => f.id === v.forageFieldId)?.type === 'forest'
      axe.current.visible = working && (atLumberyard || choppingForest)
    }
    if (shadow.current) shadow.current.visible = !held

    if (carryMesh.current) {
      carryMesh.current.visible = v.carry > 0 && v.carryType !== null
      if (v.carryType) {
        const mat = carryMesh.current.material as MeshStandardMaterial
        mat.color.set(RESOURCE_COLORS[v.carryType])
      }
    }
  })

  // pick up = take them off the job. Dropping on a building re-employs them;
  // dropping on open ground just relocates them (handled in the store).
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const g = useGame.getState()
    if (g.buildMode !== 'none' || g.refounding) return // no hand-of-god while refounding
    e.stopPropagation()
    // disable the camera the instant we grab, regardless of hover state —
    // villagers move, so onPointerOver may have re-enabled it just before this.
    if (controls) controls.enabled = false
    useGame.getState().pickUpVillager(villagerId)
    document.body.style.cursor = 'grabbing'
  }
  const onPointerOver = () => {
    if (useGame.getState().buildMode !== 'none') return
    document.body.style.cursor = 'grab'
    if (controls) controls.enabled = false
  }
  const onPointerOut = () => {
    document.body.style.cursor = 'auto'
    if (controls && useGame.getState().heldId === null) controls.enabled = true
  }

  return (
    <group
      ref={root}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <group ref={lean}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <capsuleGeometry args={[0.22, 0.45, 6, 12]} />
          <meshStandardMaterial color="#4a73c2" />
        </mesh>
        <mesh position={[0, 0.95, 0]} castShadow>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#e8c39e" />
        </mesh>
        <group ref={axe} position={[0.18, 0.6, 0.26]} rotation={[0, 0, -0.5]} visible={false}>
          <mesh castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.55, 6]} />
            <meshStandardMaterial color="#6b4a2b" />
          </mesh>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.16, 0.12, 0.04]} />
            <meshStandardMaterial color="#9aa3ad" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
        <mesh ref={carryMesh} position={[0, 0.55, 0.28]} visible={false}>
          <boxGeometry args={[0.22, 0.22, 0.22]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        {/* spear — shown while a soldier marches / fights */}
        <group ref={spear} position={[0.24, 0.5, 0.18]} visible={false}>
          <mesh position={[0, 0.12, 0.3]} rotation={[1.1, 0, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 0.95, 6]} />
            <meshStandardMaterial color="#6b4a2b" />
          </mesh>
          <mesh position={[0, 0.33, 0.72]} rotation={[1.1, 0, 0]} castShadow>
            <coneGeometry args={[0.06, 0.24, 6]} />
            <meshStandardMaterial color="#cfd6dd" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      </group>

      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.3, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.18} />
      </mesh>
    </group>
  )
}
