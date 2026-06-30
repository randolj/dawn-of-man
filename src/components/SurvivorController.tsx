import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group, Vector3 } from 'three'
import { TOWN_CENTER, useGame } from '../game/store'
import {
  CHOP_COOLDOWN,
  MOUSE_SENS,
  PITCH_CLAMP,
  SURVIVOR_EYE,
  SURVIVOR_SPEED,
} from '../game/config'

type Controls = { target: Vector3; update: () => void; enabled: boolean } | null

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']
const SWING_DUR = 0.32 // seconds of the axe's chop animation

/**
 * First-person control of the lone survivor while refounding:
 * - mouse (pointer-locked) looks around — horizontal yaw + vertical pitch
 * - W/S walk, A/D strafe (all relative to where you're looking)
 * - left-click swings the held axe at the tree / deer / berry patch in front
 * - F founds the new city (wherever you're standing) once you've gathered enough
 * Click the view to capture the mouse; Esc releases it.
 */
export function SurvivorController() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const keys = useRef<Set<string>>(new Set())
  const yaw = useRef(0)
  const pitch = useRef(0)
  const locked = useRef(false)
  const lastChop = useRef(0)
  const swingAt = useRef(-1) // when the current axe swing began (seconds)
  const wasActive = useRef(false)
  const axeRoot = useRef<Group>(null)
  const axeSwing = useRef<Group>(null)

  useEffect(() => {
    const canvas = gl.domElement
    const refounding = () => useGame.getState().refounding

    const onKeyDown = (e: KeyboardEvent) => {
      if (!refounding()) return
      const k = e.key.toLowerCase()
      if (MOVE_KEYS.includes(k)) keys.current.add(k)
      if (k === 'f' || k === 'enter') {
        const rf = useGame.getState().refounding
        const r = useGame.getState().resources
        if (rf && r.wood >= rf.woodGoal && r.food >= rf.foodGoal) useGame.getState().foundNewCity()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())

    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current || !refounding()) return
      yaw.current -= e.movementX * MOUSE_SENS
      pitch.current = Math.max(-PITCH_CLAMP, Math.min(PITCH_CLAMP, pitch.current - e.movementY * MOUSE_SENS))
    }
    const onMouseDown = (e: MouseEvent) => {
      if (!refounding() || e.button !== 0) return
      if (!locked.current) {
        canvas.requestPointerLock?.() // first click captures the mouse
        return
      }
      const now = performance.now() / 1000
      if (now - lastChop.current < CHOP_COOLDOWN) return
      lastChop.current = now
      swingAt.current = now // swing the axe
      useGame.getState().survivorChop()
    }
    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mousedown', onMouseDown)
    document.addEventListener('pointerlockchange', onLockChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('pointerlockchange', onLockChange)
    }
  }, [gl])

  useFrame((state, dt) => {
    // read the LIVE controls — MapControls unmounts in first person and remounts
    // on founding, so a hook-captured ref would go stale
    const controls = state.controls as Controls
    const rf = useGame.getState().refounding
    if (!rf) {
      if (axeRoot.current) axeRoot.current.visible = false
      // just left survival mode — restore the overhead view, centred on the NEW
      // capital. MapControls re-mounts a frame or two later, so keep replacing the
      // camera each frame until it's back, THEN hand over (don't finish early).
      if (wasActive.current) {
        keys.current.clear()
        if (document.pointerLockElement) document.exitPointerLock()
        const cx = TOWN_CENTER.x
        const cz = TOWN_CENTER.z
        camera.position.set(cx + 14, 13, cz + 14)
        camera.lookAt(cx, 0.5, cz)
        if (controls) {
          controls.target.set(cx, 0.5, cz)
          controls.enabled = true
          controls.update() // re-derives the orbit from the camera's new position
          wasActive.current = false // controls are back — hand the camera over
        }
      }
      return
    }

    const v = useGame.getState().villagers.find((x) => x.id === rf.survivorId)
    if (!v) return
    if (!wasActive.current) {
      wasActive.current = true
      yaw.current = v.heading
      pitch.current = 0
    }
    if (controls) controls.enabled = false

    const k = keys.current
    const d = Math.min(dt, 0.05)
    const psi = yaw.current
    // forward & right on the ground, relative to where you're looking
    const fX = Math.sin(psi)
    const fZ = Math.cos(psi)
    const rX = -Math.cos(psi)
    const rZ = Math.sin(psi)
    let mx = 0
    let mz = 0
    if (k.has('w') || k.has('arrowup')) (mx += fX), (mz += fZ)
    if (k.has('s') || k.has('arrowdown')) (mx -= fX), (mz -= fZ)
    if (k.has('d') || k.has('arrowright')) (mx += rX), (mz += rZ)
    if (k.has('a') || k.has('arrowleft')) (mx -= rX), (mz -= rZ)
    const len = Math.hypot(mx, mz)
    if (len > 0) {
      v.pos.x += (mx / len) * SURVIVOR_SPEED * d
      v.pos.z += (mz / len) * SURVIVOR_SPEED * d
    }
    v.heading = psi

    // eyes at the survivor, looking out along yaw + pitch
    const cp = Math.cos(pitch.current)
    camera.position.set(v.pos.x, SURVIVOR_EYE, v.pos.z)
    camera.lookAt(
      v.pos.x + Math.sin(psi) * cp * 5,
      SURVIVOR_EYE + Math.sin(pitch.current) * 5,
      v.pos.z + Math.cos(psi) * cp * 5,
    )

    // held axe: pinned to the lower-right of view, dips on a swing
    const ar = axeRoot.current
    if (ar) {
      ar.visible = true
      ar.position.copy(camera.position)
      ar.quaternion.copy(camera.quaternion)
      ar.translateX(0.34)
      ar.translateY(-0.32)
      ar.translateZ(-0.62)
      if (axeSwing.current) {
        const el = performance.now() / 1000 - swingAt.current
        const dip = el >= 0 && el < SWING_DUR ? Math.sin((el / SWING_DUR) * Math.PI) * 1.3 : 0
        axeSwing.current.rotation.x = -0.5 + dip
      }
    }
  })

  // the first-person axe viewmodel (positioned each frame above)
  return (
    <group ref={axeRoot} visible={false}>
      <group ref={axeSwing}>
        {/* wooden handle */}
        <mesh position={[0, 0.12, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.028, 0.62, 8]} />
          <meshStandardMaterial color="#7a5530" />
        </mesh>
        {/* axe head near the top of the handle */}
        <group position={[0, 0.42, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.05, 0.15, 0.1]} />
            <meshStandardMaterial color="#aab2bb" metalness={0.6} roughness={0.35} />
          </mesh>
          {/* the cutting edge — flares FORWARD (toward what you swing at) */}
          <mesh position={[0, 0, -0.12]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
            <coneGeometry args={[0.085, 0.14, 3]} />
            <meshStandardMaterial color="#d2d8df" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
