import { useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import type { PointLight } from 'three'
import { useGame } from '../game/store'
import { TOWN_TIERS } from '../game/config'
import { UpgradeBeacon } from './Residence'

export function TownCenter() {
  const tierIndex = useGame((s) => s.tierIndex)
  const resources = useGame((s) => s.resources)
  const selection = useGame((s) => s.selection)
  const tier = TOWN_TIERS[tierIndex]
  const fireLight = useRef<PointLight>(null)
  const flame = useRef<THREE_Group>(null)

  const next = TOWN_TIERS[tierIndex + 1]
  const canUpgrade =
    !!next?.upgradeCost &&
    resources.wood >= next.upgradeCost.wood &&
    resources.food >= next.upgradeCost.food
  const selected = selection?.kind === 'townhall'
  const beaconY = tierIndex === 0 ? 1.9 : tierIndex === 1 ? 4.2 : tier.height + 1.9

  // flickering campfire light + flame
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const flicker = 1 + Math.sin(t * 18) * 0.12 + Math.sin(t * 7.3) * 0.08
    if (fireLight.current) fireLight.current.intensity = 2.4 * flicker
    if (flame.current) {
      flame.current.scale.y = flicker
      flame.current.rotation.y = t * 1.5
    }
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (useGame.getState().buildMode !== 'none') return
    e.stopPropagation()
    useGame.getState().selectTownhall()
  }
  const onOver = () => {
    if (useGame.getState().buildMode === 'none') document.body.style.cursor = 'pointer'
  }
  const onOut = () => (document.body.style.cursor = 'auto')

  return (
    <group onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[2.0, 2.3, 36]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={0.85} />
        </mesh>
      )}
      {canUpgrade && <UpgradeBeacon y={beaconY} />}
      {tierIndex === 0 ? (
        // ---- Campfire ----
        <group>
          {/* ring of stones */}
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2
            return (
              <mesh
                key={i}
                position={[Math.cos(a) * 0.95, 0.12, Math.sin(a) * 0.95]}
                castShadow
              >
                <dodecahedronGeometry args={[0.28, 0]} />
                <meshStandardMaterial color="#8c8c93" flatShading />
              </mesh>
            )
          })}
          {/* logs */}
          <mesh position={[0, 0.15, 0]} rotation={[0, 0.6, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 1.3, 8]} />
            <meshStandardMaterial color="#5a3a22" />
          </mesh>
          <mesh position={[0, 0.15, 0]} rotation={[0, -0.5, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 1.3, 8]} />
            <meshStandardMaterial color="#6b4226" />
          </mesh>
          {/* flame */}
          <group ref={flame as never} position={[0, 0.4, 0]}>
            <mesh>
              <coneGeometry args={[0.3, 0.9, 12]} />
              <meshStandardMaterial color="#ff7a18" emissive="#ff5a00" emissiveIntensity={2} />
            </mesh>
            <mesh position={[0, 0.12, 0]} scale={0.6}>
              <coneGeometry args={[0.3, 0.9, 12]} />
              <meshStandardMaterial color="#ffd24a" emissive="#ffb000" emissiveIntensity={2.2} />
            </mesh>
          </group>
          <pointLight ref={fireLight} position={[0, 1, 0]} color="#ff9d3c" distance={12} castShadow />
        </group>
      ) : tierIndex === 1 ? (
        // ---- Big tent (Stone Age) ----
        <group>
          {/* canvas */}
          <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
            <coneGeometry args={[1.95, 3.0, 12]} />
            <meshStandardMaterial color={tier.color} flatShading />
          </mesh>
          {/* rope band near the base */}
          <mesh position={[0, 0.78, 0]} castShadow>
            <cylinderGeometry args={[1.55, 1.62, 0.14, 12]} />
            <meshStandardMaterial color="#9a8458" flatShading />
          </mesh>
          {/* crossing support poles poking out the top */}
          <mesh position={[0, 2.85, 0]} rotation={[0.28, 0, 0.2]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 1.3, 6]} />
            <meshStandardMaterial color="#5a3a22" />
          </mesh>
          <mesh position={[0, 2.85, 0]} rotation={[-0.28, 0, -0.2]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 1.3, 6]} />
            <meshStandardMaterial color="#6b4226" />
          </mesh>
          {/* dark triangular entrance flap at the front */}
          <mesh position={[0, 0.85, 1.55]} rotation={[0.12, 0, 0]}>
            <coneGeometry args={[0.55, 1.7, 3]} />
            <meshStandardMaterial color="#2c1d12" />
          </mesh>
          {/* rolled-back flaps framing the doorway */}
          <mesh position={[-0.5, 0.9, 1.55]} rotation={[0, 0, 0.3]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 1.4, 6]} />
            <meshStandardMaterial color="#c2ae7e" flatShading />
          </mesh>
          <mesh position={[0.5, 0.9, 1.55]} rotation={[0, 0, -0.3]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 1.4, 6]} />
            <meshStandardMaterial color="#c2ae7e" flatShading />
          </mesh>
          {/* banner on top */}
          <mesh position={[0, 3.45, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 1.1, 6]} />
            <meshStandardMaterial color="#3a2a1a" />
          </mesh>
          <mesh position={[0.36, 3.75, 0]}>
            <planeGeometry args={[0.72, 0.46]} />
            <meshStandardMaterial color="#c0392b" side={2} />
          </mesh>
        </group>
      ) : (
        // ---- Building (longhouse -> town hall -> keep) ----
        <group>
          {/* body */}
          <mesh position={[0, tier.height / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.4, tier.height, 2.4]} />
            <meshStandardMaterial color={tier.color} />
          </mesh>
          {/* roof */}
          <mesh position={[0, tier.height + 0.55, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[2.1, 1.2, 4]} />
            <meshStandardMaterial color="#7a4a2b" flatShading />
          </mesh>
          {/* door */}
          <mesh position={[0, 0.55, 1.21]}>
            <planeGeometry args={[0.7, 1.1]} />
            <meshStandardMaterial color="#2c1d12" />
          </mesh>
          {/* a small banner that grows with each era */}
          <mesh position={[1.4, tier.height + 0.2, 0]}>
            <boxGeometry args={[0.06, 1.4, 0.06]} />
            <meshStandardMaterial color="#3a2a1a" />
          </mesh>
          <mesh position={[1.75, tier.height + 0.55, 0]}>
            <planeGeometry args={[0.7, 0.5]} />
            <meshStandardMaterial color="#c0392b" side={2} />
          </mesh>
        </group>
      )}
    </group>
  )
}

// minimal local type so we don't import three just for a ref annotation
type THREE_Group = import('three').Group
