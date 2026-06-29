import { FIELDS, FIELD_CLUMPS, type Clump } from '../game/fields'
import type { ResourceField } from '../game/types'

const noHit = () => null

// berries scattered over the bush surface (centre at y≈0.4, radius ≈0.5)
const BERRY_SPOTS: [number, number, number][] = [
  [0.3, 0.58, 0.3],
  [-0.34, 0.5, 0.18],
  [0.12, 0.74, 0.34],
  [-0.18, 0.66, 0.36],
  [0.4, 0.4, -0.06],
  [-0.3, 0.42, -0.24],
  [0.02, 0.46, 0.5],
  [0.24, 0.34, 0.42],
  [-0.08, 0.32, 0.46],
  [0.34, 0.62, -0.18],
]

function PineClump({ c }: { c: Clump }) {
  const green = `hsl(${112 + c.tone * 22}, ${44 + c.tone * 16}%, ${24 + c.tone * 10}%)`
  return (
    <group position={[c.x, 0, c.z]} scale={c.scale}>
      <mesh position={[0, 0.45, 0]} raycast={noHit} castShadow>
        <cylinderGeometry args={[0.14, 0.2, 0.9, 6]} />
        <meshStandardMaterial color="#6b4a2b" />
      </mesh>
      <mesh position={[0, 1.35, 0]} raycast={noHit} castShadow>
        <coneGeometry args={[0.82, 1.4, 8]} />
        <meshStandardMaterial color={green} flatShading />
      </mesh>
      <mesh position={[0, 1.95, 0]} raycast={noHit} castShadow>
        <coneGeometry args={[0.58, 1.0, 8]} />
        <meshStandardMaterial color={green} flatShading />
      </mesh>
    </group>
  )
}

function BushClump({ c }: { c: Clump }) {
  return (
    <group position={[c.x, 0, c.z]} scale={c.scale}>
      {/* leafy bush */}
      <mesh position={[0, 0.38, 0]} raycast={noHit} castShadow>
        <sphereGeometry args={[0.5, 10, 10]} />
        <meshStandardMaterial color="#3f8230" flatShading />
      </mesh>
      {/* cluster of red berries, rotated per-bush so they vary */}
      <group rotation={[0, c.tone * Math.PI * 2, 0]}>
        {BERRY_SPOTS.map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} raycast={noHit} castShadow>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#e23b2e" emissive="#8a1f15" emissiveIntensity={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Field({ field }: { field: ResourceField }) {
  const clumps = FIELD_CLUMPS[field.id] ?? []
  const tint = field.type === 'forest' ? '#5d7e3c' : '#7d8a4a'
  return (
    <group>
      {/* subtle ground tint marking the field area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[field.pos.x, 0.012, field.pos.z]} raycast={noHit}>
        <circleGeometry args={[field.radius + 1.2, 36]} />
        <meshStandardMaterial color={tint} transparent opacity={0.55} />
      </mesh>
      {clumps.map((c, i) =>
        field.type === 'forest' ? <PineClump key={i} c={c} /> : <BushClump key={i} c={c} />,
      )}
    </group>
  )
}

export function Fields() {
  return (
    <group>
      {FIELDS.map((f) => (
        <Field key={f.id} field={f} />
      ))}
    </group>
  )
}
