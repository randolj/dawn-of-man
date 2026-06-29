import { WORLD_RADIUS } from '../game/scenery'

export function Ground() {
  return (
    <group>
      {/* main grass field — large enough to roam and see the mountains */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[WORLD_RADIUS, 72]} />
        <meshStandardMaterial color="#6f9a47" />
      </mesh>

      {/* a darker dirt clearing under the town center */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[4.2, 48]} />
        <meshStandardMaterial color="#8a6b46" />
      </mesh>
    </group>
  )
}
