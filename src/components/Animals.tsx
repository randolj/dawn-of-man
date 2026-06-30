import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { useGame } from '../game/store'

const LEGS: [number, number][] = [
  [-0.12, 0.26],
  [0.12, 0.26],
  [-0.12, -0.26],
  [0.12, -0.26],
]

// one deer; mirrors its live sim position onto the mesh (hidden while respawning)
function Deer({ animalId }: { animalId: number }) {
  const root = useRef<Group>(null)
  const last = useRef({ x: 0, z: 0 })
  useFrame((state) => {
    const an = useGame.getState().animals.find((a) => a.id === animalId)
    if (!an || !root.current) return
    root.current.visible = an.alive
    if (!an.alive) return
    const t = state.clock.elapsedTime
    const moved = Math.hypot(an.pos.x - last.current.x, an.pos.z - last.current.z) > 0.003
    last.current.x = an.pos.x
    last.current.z = an.pos.z
    const y = moved ? Math.abs(Math.sin(t * 8 + an.bob)) * 0.05 : 0
    root.current.position.set(an.pos.x, y, an.pos.z)
    root.current.rotation.y = an.heading
  })
  return (
    <group ref={root}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.32, 0.32, 0.68]} />
        <meshStandardMaterial color="#9a6b43" flatShading />
      </mesh>
      <mesh position={[0, 0.72, 0.38]} rotation={[0.5, 0, 0]} castShadow>
        <boxGeometry args={[0.15, 0.34, 0.15]} />
        <meshStandardMaterial color="#9a6b43" flatShading />
      </mesh>
      <mesh position={[0, 0.92, 0.5]} castShadow>
        <boxGeometry args={[0.17, 0.17, 0.26]} />
        <meshStandardMaterial color="#a9784f" flatShading />
      </mesh>
      {LEGS.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.2, z]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.42, 5]} />
          <meshStandardMaterial color="#6f4a2c" flatShading />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.35, 12]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.16} />
      </mesh>
    </group>
  )
}

export function Animals() {
  const animals = useGame((s) => s.animals)
  return (
    <group>
      {animals.map((a) => (
        <Deer key={a.id} animalId={a.id} />
      ))}
    </group>
  )
}
