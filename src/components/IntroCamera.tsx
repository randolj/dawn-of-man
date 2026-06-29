import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'

// A gentle establishing shot: start wide & high, glide down to the resting
// framing, then hand control to MapControls. END matches the Canvas's initial
// camera so the handoff is seamless (no snap).
const START = new Vector3(3, 21, 28)
const END = new Vector3(14, 13, 14)
const TARGET = new Vector3(0, 0.5, 0)
const DURATION = 2.7

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export function IntroCamera({ onDone }: { onDone: () => void }) {
  const camera = useThree((s) => s.camera)
  const t = useRef(0)
  const finished = useRef(false)

  useEffect(() => {
    camera.position.copy(START)
    camera.lookAt(TARGET)
    // let an impatient player skip the intro
    const skip = () => (t.current = DURATION)
    window.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', skip)
    window.addEventListener('wheel', skip, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('wheel', skip)
    }
  }, [camera])

  useFrame((_, dt) => {
    if (finished.current) return
    t.current = Math.min(DURATION, t.current + dt)
    camera.position.lerpVectors(START, END, easeOutCubic(t.current / DURATION))
    camera.lookAt(TARGET)
    if (t.current >= DURATION) {
      finished.current = true
      camera.position.copy(END)
      camera.lookAt(TARGET)
      onDone()
    }
  })

  return null
}
