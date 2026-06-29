import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import { useGame } from '../game/store'
import { TOWN_TIERS } from '../game/config'

const noHit = () => null

/**
 * Your village's claimed territory: a soft, slightly-transparent tint over the
 * owned land. The radius eases outward whenever you upgrade the townhall, so the
 * borders visibly grow.
 */
export function Territory() {
  const tierIndex = useGame((s) => s.tierIndex)
  const target = TOWN_TIERS[tierIndex].territoryRadius
  const r = useRef(target) // animated current radius
  const disc = useRef<Mesh>(null)

  useFrame((_, dt) => {
    r.current += (target - r.current) * Math.min(1, dt * 2.5)
    if (disc.current) disc.current.scale.set(r.current, r.current, 1)
  })

  return (
    <mesh ref={disc} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]} raycast={noHit}>
      <circleGeometry args={[1, 64]} />
      <meshBasicMaterial color="#ffe2b0" transparent opacity={0.12} depthWrite={false} />
    </mesh>
  )
}
