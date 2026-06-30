import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useGame } from '../game/store'

type Controls = { target: Vector3; update: () => void; enabled: boolean } | null

const PAN_SPEED = 32 // world units / second at full tilt

/**
 * WASD / arrow-key panning on top of MapControls, so the "god" can roam the map
 * and go see the mountains instead of being locked to the campfire.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as Controls
  const heldId = useGame((s) => s.heldId)
  const keys = useRef<Set<string>>(new Set())

  // hard guarantee: the camera is locked while a villager is held, and unlocked
  // the moment it's dropped — independent of any hover/pointer timing.
  useEffect(() => {
    if (controls) controls.enabled = heldId === null
  }, [controls, heldId])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k))
        keys.current.add(k)
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const fwd = useRef(new Vector3())
  const right = useRef(new Vector3())
  const move = useRef(new Vector3())
  const focusVec = useRef(new Vector3())
  const offsetVec = useRef(new Vector3())

  useFrame((_, dt) => {
    if (!controls || heldId !== null) return // don't pan while carrying a villager
    const k = keys.current
    let x = 0
    let z = 0
    if (k.has('w') || k.has('arrowup')) z += 1
    if (k.has('s') || k.has('arrowdown')) z -= 1
    if (k.has('a') || k.has('arrowleft')) x -= 1
    if (k.has('d') || k.has('arrowright')) x += 1

    // smoothly fly to a focused settlement (the switcher); any manual key cancels it
    const focus = useGame.getState().cameraFocus
    if (focus) {
      if (x !== 0 || z !== 0) {
        useGame.getState().focusCamera(null)
      } else {
        const target = focusVec.current.set(focus.x, controls.target.y, focus.z)
        const offset = offsetVec.current.copy(camera.position).sub(controls.target) // keep zoom/angle
        controls.target.lerp(target, Math.min(1, dt * 5))
        camera.position.copy(controls.target).add(offset)
        controls.update()
        if (controls.target.distanceTo(target) < 0.4) useGame.getState().focusCamera(null)
        return
      }
    }

    if (x === 0 && z === 0) return

    // camera-relative directions flattened onto the ground plane
    camera.getWorldDirection(fwd.current)
    fwd.current.y = 0
    fwd.current.normalize()
    right.current.crossVectors(fwd.current, new Vector3(0, 1, 0)).normalize()

    move.current.set(0, 0, 0)
    move.current.addScaledVector(fwd.current, z)
    move.current.addScaledVector(right.current, x)
    if (move.current.lengthSq() > 0) {
      move.current.normalize().multiplyScalar(PAN_SPEED * Math.min(dt, 0.05))
      camera.position.add(move.current)
      controls.target.add(move.current)
      controls.update()
    }
  })

  return null
}
