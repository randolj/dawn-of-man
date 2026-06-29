import { useMemo } from 'react'
import { useGame } from '../game/store'
import type { PathSegment, Vec2 } from '../game/types'
import { PATH_WIDTH } from '../game/config'

const noHit = () => null

// a path segment is a thin flat slab laid on the ground between a and b
function Segment({ a, b, color }: { a: Vec2; b: Vec2; color: string }) {
  const { len, angle, mx, mz } = useMemo(() => {
    const dx = b.x - a.x
    const dz = b.z - a.z
    return {
      len: Math.hypot(dx, dz),
      angle: Math.atan2(dz, dx),
      mx: (a.x + b.x) / 2,
      mz: (a.z + b.z) / 2,
    }
  }, [a.x, a.z, b.x, b.z])

  return (
    <group position={[mx, 0.03, mz]} rotation={[0, -angle, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noHit} receiveShadow>
        {/* length runs along X after the Y-rotation */}
        <planeGeometry args={[len + PATH_WIDTH, PATH_WIDTH]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* rounded-ish ends so corners in a chain join nicely */}
      <mesh position={[len / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noHit}>
        <circleGeometry args={[PATH_WIDTH / 2, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

export function Paths() {
  const paths = useGame((s) => s.paths)
  const draft = useGame((s) => s.pathDraft)

  return (
    <group>
      {paths.map((seg: PathSegment) => (
        <Segment key={seg.id} a={seg.a} b={seg.b} color="#9a7b53" />
      ))}
      {/* faint preview of the chain currently being drawn */}
      {draft.length > 1 &&
        draft.slice(1).map((p, i) => (
          <Segment key={`d${i}`} a={draft[i]} b={p} color="#b8a071" />
        ))}
    </group>
  )
}
