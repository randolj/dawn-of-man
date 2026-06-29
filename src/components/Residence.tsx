import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Material } from 'three'
import type { ResidenceModelKind } from '../game/types'

// A single mesh that uses either a shared material (the placement ghost) or its
// own colored material (a real building).
export function Part({
  children,
  position,
  rotation,
  color,
  material,
  flat = true,
}: {
  children: ReactNode
  position?: [number, number, number]
  rotation?: [number, number, number]
  color: string
  material?: Material
  flat?: boolean
}) {
  return (
    <mesh position={position} rotation={rotation} material={material} castShadow receiveShadow>
      {children}
      {!material && <meshStandardMaterial color={color} flatShading={flat} />}
    </mesh>
  )
}

function LeanTo({ material }: { material?: Material }) {
  // a crude slanted shelter: two back posts and a single sloped thatch roof
  return (
    <group>
      <Part position={[-0.55, 0.45, 0]} color="#6b4a2b" material={material}>
        <cylinderGeometry args={[0.06, 0.06, 0.9, 6]} />
      </Part>
      <Part position={[0.55, 0.25, 0]} color="#6b4a2b" material={material}>
        <cylinderGeometry args={[0.06, 0.06, 0.5, 6]} />
      </Part>
      {/* sloped roof */}
      <Part position={[0, 0.62, 0]} rotation={[0, 0, -0.5]} color="#9c8348" material={material}>
        <boxGeometry args={[1.35, 0.12, 1.1]} />
      </Part>
      {/* back wall */}
      <Part position={[-0.6, 0.4, 0]} rotation={[0, 0, 0.2]} color="#7d6a3a" material={material}>
        <boxGeometry args={[0.1, 0.85, 1.0]} />
      </Part>
    </group>
  )
}

function Tent({ material }: { material?: Material }) {
  return (
    <group>
      <Part position={[0, 0.7, 0]} color="#caa46a" material={material}>
        <coneGeometry args={[0.78, 1.4, 9]} />
      </Part>
      {/* crossing poles poking out the top */}
      <Part position={[0.05, 1.25, 0]} rotation={[0.2, 0, 0.25]} color="#6b4a2b" material={material}>
        <cylinderGeometry args={[0.025, 0.025, 0.5, 5]} />
      </Part>
      <Part position={[-0.05, 1.25, 0]} rotation={[-0.2, 0, -0.25]} color="#6b4a2b" material={material}>
        <cylinderGeometry args={[0.025, 0.025, 0.5, 5]} />
      </Part>
      {/* entrance flap */}
      <Part position={[0, 0.32, 0.74]} color="#3a2a1a" material={material}>
        <coneGeometry args={[0.22, 0.64, 3]} />
      </Part>
    </group>
  )
}

function Hut({ material }: { material?: Material }) {
  return (
    <group>
      <Part position={[0, 0.4, 0]} color="#b08d5b" material={material}>
        <cylinderGeometry args={[0.72, 0.78, 0.8, 9]} />
      </Part>
      <Part position={[0, 1.05, 0]} color="#9c7a3a" material={material}>
        <coneGeometry args={[0.98, 0.75, 9]} />
      </Part>
      <Part position={[0, 0.35, 0.74]} color="#3a2a1a" material={material}>
        <planeGeometry args={[0.4, 0.6]} />
      </Part>
    </group>
  )
}

function House({ material }: { material?: Material }) {
  return (
    <group>
      <Part position={[0, 0.45, 0]} color="#d8c8a8" material={material} flat={false}>
        <boxGeometry args={[1.5, 0.9, 1.3]} />
      </Part>
      <Part position={[0, 1.15, 0]} rotation={[0, Math.PI / 4, 0]} color="#9c4a2f" material={material}>
        <coneGeometry args={[1.25, 0.7, 4]} />
      </Part>
      <Part position={[0, 0.3, 0.66]} color="#3a271a" material={material} flat={false}>
        <planeGeometry args={[0.4, 0.6]} />
      </Part>
    </group>
  )
}

function Cottage({ material }: { material?: Material }) {
  return (
    <group>
      {/* stone base */}
      <Part position={[0, 0.18, 0]} color="#9a9a9a" material={material} flat={false}>
        <boxGeometry args={[1.74, 0.36, 1.5]} />
      </Part>
      {/* plaster walls */}
      <Part position={[0, 0.66, 0]} color="#e7dab4" material={material} flat={false}>
        <boxGeometry args={[1.6, 0.7, 1.36]} />
      </Part>
      {/* roof */}
      <Part position={[0, 1.4, 0]} rotation={[0, Math.PI / 4, 0]} color="#7a4a2b" material={material}>
        <coneGeometry args={[1.45, 0.85, 4]} />
      </Part>
      {/* chimney */}
      <Part position={[0.55, 1.35, 0.35]} color="#8a5a3a" material={material} flat={false}>
        <boxGeometry args={[0.22, 0.7, 0.22]} />
      </Part>
      <Part position={[0, 0.42, 0.7]} color="#3a271a" material={material} flat={false}>
        <planeGeometry args={[0.42, 0.66]} />
      </Part>
    </group>
  )
}

export function ResidenceModel({
  kind,
  material,
}: {
  kind: ResidenceModelKind
  material?: Material
}) {
  switch (kind) {
    case 'leanto':
      return <LeanTo material={material} />
    case 'tent':
      return <Tent material={material} />
    case 'hut':
      return <Hut material={material} />
    case 'house':
      return <House material={material} />
    case 'cottage':
      return <Cottage material={material} />
  }
}

// floating gold chevron that hovers over residences you can still upgrade
export function UpgradeBeacon({ y }: { y: number }) {
  const g = useRef<Group>(null)
  useFrame((state) => {
    if (!g.current) return
    const t = state.clock.elapsedTime
    g.current.position.y = y + Math.sin(t * 3) * 0.12
    g.current.rotation.y = t * 1.5
  })
  return (
    <group ref={g} position={[0, y, 0]}>
      <mesh>
        <coneGeometry args={[0.28, 0.4, 4]} />
        <meshStandardMaterial
          color="#ffce4a"
          emissive="#ffae00"
          emissiveIntensity={0.7}
          flatShading
        />
      </mesh>
    </group>
  )
}
