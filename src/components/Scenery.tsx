import { SCENERY } from '../game/scenery'
import { useGame } from '../game/store'

// decorative meshes must never intercept pointer events (so ground clicks,
// pickups and ghosts keep working); this raycast fn reports no hits.
const noHit = () => null

function MountainMesh({ m }: { m: (typeof SCENERY.mountains)[number] }) {
  return (
    <group position={[m.x, 0, m.z]}>
      <mesh position={[0, m.height / 2, 0]} raycast={noHit} castShadow receiveShadow>
        <coneGeometry args={[m.radius, m.height, 7]} />
        <meshStandardMaterial color="#6d6f78" flatShading />
      </mesh>
      {m.snow && (
        <mesh position={[0, m.height - m.height * 0.16, 0]} raycast={noHit}>
          <coneGeometry args={[m.radius * 0.42, m.height * 0.34, 7]} />
          <meshStandardMaterial color="#eef4ff" flatShading />
        </mesh>
      )}
    </group>
  )
}

function TreeMesh({ t }: { t: (typeof SCENERY.trees)[number] }) {
  const green = `hsl(${110 + t.tone * 30}, ${40 + t.tone * 18}%, ${28 + t.tone * 12}%)`
  return (
    <group position={[t.x, 0, t.z]} scale={t.scale}>
      <mesh position={[0, 0.45, 0]} raycast={noHit} castShadow>
        <cylinderGeometry args={[0.14, 0.2, 0.9, 6]} />
        <meshStandardMaterial color="#6b4a2b" />
      </mesh>
      {t.kind === 'pine' ? (
        <>
          <mesh position={[0, 1.35, 0]} raycast={noHit} castShadow>
            <coneGeometry args={[0.85, 1.4, 8]} />
            <meshStandardMaterial color={green} flatShading />
          </mesh>
          <mesh position={[0, 1.95, 0]} raycast={noHit} castShadow>
            <coneGeometry args={[0.6, 1.1, 8]} />
            <meshStandardMaterial color={green} flatShading />
          </mesh>
        </>
      ) : (
        <mesh position={[0, 1.35, 0]} raycast={noHit} castShadow>
          <sphereGeometry args={[0.85, 10, 10]} />
          <meshStandardMaterial color={green} flatShading />
        </mesh>
      )}
    </group>
  )
}

export function Scenery() {
  const choppedTrees = useGame((s) => s.choppedTrees)
  const chopped = new Set(choppedTrees)
  return (
    <group>
      {SCENERY.mountains.map((m, i) => (
        <MountainMesh key={`m${i}`} m={m} />
      ))}
      {SCENERY.trees.map((t, i) =>
        // a scenery tree the survivor chopped down is gone from the world
        chopped.has(`s${i}`) ? null : <TreeMesh key={`t${i}`} t={t} />,
      )}
      {SCENERY.rocks.map((r, i) => (
        <mesh
          key={`r${i}`}
          position={[r.x, r.scale * 0.25, r.z]}
          rotation={[0, r.rot, 0]}
          scale={r.scale}
          raycast={noHit}
          castShadow
        >
          <dodecahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color="#8a8d94" flatShading />
        </mesh>
      ))}
    </group>
  )
}
