import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Group, Mesh, MeshStandardMaterial } from 'three'
import { useGame } from '../game/store'

// The fallen star: a crater + dark rock that smokes on the horizon until a scout
// reaches it. Paying the world's wealth cracks it open into a Starforge (the
// Smithy building renders in the crater); forging Starmetal raises either a
// shimmering portal (magic) or a starship (technology) — the run's final image.

const noHit = () => null

const SMOKE_PUFFS = 11
function MeteorSmoke() {
  const puffs = useRef<(Mesh | null)[]>([])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const m = puffs.current[i]
      if (!m) continue
      const phase = (t * 0.18 + i / SMOKE_PUFFS) % 1
      const sway = 0.4 + phase * 1.6
      m.position.set(Math.sin(t * 0.5 + i * 1.7) * sway, 2.5 + phase * 20, Math.cos(t * 0.45 + i * 2.1) * sway)
      m.scale.setScalar(0.9 + phase * 2.4)
      ;(m.material as MeshStandardMaterial).opacity = 0.7 * Math.sin(phase * Math.PI)
    }
  })
  return (
    <>
      {Array.from({ length: SMOKE_PUFFS }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            puffs.current[i] = el
          }}
          raycast={noHit}
          renderOrder={4}
        >
          <sphereGeometry args={[1, 12, 10]} />
          <meshStandardMaterial color="#3a3530" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </>
  )
}

// dark, faceted meteorite with veins of cooling glow
function MeteorRock() {
  const chunks = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2
        const r = 0.7 + (i % 3) * 0.5
        return {
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          y: 0.3 + (i % 2) * 0.6,
          s: 0.9 + (i % 3) * 0.5,
        }
      }),
    [],
  )
  return (
    <group>
      <mesh position={[0, 1.4, 0]} raycast={noHit}>
        <dodecahedronGeometry args={[2.4, 0]} />
        <meshStandardMaterial color="#241f1c" roughness={0.9} emissive="#ff5a1e" emissiveIntensity={0.18} />
      </mesh>
      {chunks.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} rotation={[c.x, c.z, c.y]} raycast={noHit}>
          <dodecahedronGeometry args={[c.s, 0]} />
          <meshStandardMaterial color="#2c2520" roughness={0.95} emissive="#ff4a12" emissiveIntensity={0.12} />
        </mesh>
      ))}
    </group>
  )
}

// embers rising from the cracked, working forge
function ForgeGlow() {
  const ref = useRef<Group>(null)
  useFrame((s) => {
    if (ref.current) ref.current.children.forEach((c, i) => {
      c.position.y = 1 + ((s.clock.elapsedTime * 0.8 + i * 0.3) % 2.4)
    })
  })
  return (
    <group>
      <pointLight position={[0, 1.6, 0]} color="#ffb14a" intensity={2.4} distance={16} />
      <mesh position={[0, 0.2, 0]} rotation-x={-Math.PI / 2} raycast={noHit}>
        <circleGeometry args={[2.6, 24]} />
        <meshStandardMaterial color="#ff7a1e" emissive="#ff7a1e" emissiveIntensity={1.4} transparent opacity={0.5} />
      </mesh>
      <group ref={ref}>
        {Array.from({ length: 6 }).map((_, i) => (
          <mesh key={i} position={[Math.cos(i) * 0.8, 1, Math.sin(i * 1.6) * 0.8]} raycast={noHit}>
            <sphereGeometry args={[0.12, 6, 6]} />
            <meshStandardMaterial color="#ffd27a" emissive="#ffb14a" emissiveIntensity={2} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// magic ending: a tall shimmering portal ring
function Portal() {
  const disc = useRef<Mesh>(null)
  const ring = useRef<Mesh>(null)
  useFrame((s) => {
    const t = s.clock.elapsedTime
    if (disc.current) {
      disc.current.rotation.z = t * 0.6
      ;(disc.current.material as MeshStandardMaterial).opacity = 0.55 + Math.sin(t * 2) * 0.2
    }
    if (ring.current) ring.current.rotation.z = -t * 0.3
  })
  return (
    <group position={[0, 4.2, 0]}>
      <pointLight color="#b78bff" intensity={3} distance={28} />
      <mesh ref={ring} raycast={noHit}>
        <torusGeometry args={[3.4, 0.45, 16, 40]} />
        <meshStandardMaterial color="#7d4bff" emissive="#a06bff" emissiveIntensity={1.6} roughness={0.3} />
      </mesh>
      <mesh ref={disc} raycast={noHit}>
        <circleGeometry args={[3.1, 40]} />
        <meshStandardMaterial color="#c4b6ff" emissive="#9a7bff" emissiveIntensity={1.2} transparent opacity={0.6} side={2} />
      </mesh>
    </group>
  )
}

// tech ending: a sleek starship poised on the crater
function Starship() {
  const ref = useRef<Group>(null)
  useFrame((s) => {
    if (ref.current) ref.current.position.y = Math.sin(s.clock.elapsedTime * 0.8) * 0.25
  })
  return (
    <group ref={ref} position={[0, 3.4, 0]}>
      <pointLight position={[0, -2.5, 0]} color="#7adcff" intensity={2.4} distance={20} />
      {/* hull */}
      <mesh raycast={noHit}>
        <cylinderGeometry args={[0.9, 1.3, 5, 16]} />
        <meshStandardMaterial color="#d7e2ec" metalness={0.7} roughness={0.25} />
      </mesh>
      {/* nose */}
      <mesh position={[0, 3.2, 0]} raycast={noHit}>
        <coneGeometry args={[0.9, 2.4, 16]} />
        <meshStandardMaterial color="#c4b6ff" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* fins */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 1.1, -2, Math.sin(a) * 1.1]} rotation={[0, -a, 0.5]} raycast={noHit}>
            <boxGeometry args={[0.16, 1.8, 1.2]} />
            <meshStandardMaterial color="#8aa0b4" metalness={0.6} roughness={0.4} />
          </mesh>
        )
      })}
      {/* engine glow */}
      <mesh position={[0, -2.7, 0]} raycast={noHit}>
        <sphereGeometry args={[0.7, 12, 12]} />
        <meshStandardMaterial color="#9fe8ff" emissive="#7adcff" emissiveIntensity={2.4} />
      </mesh>
    </group>
  )
}

export function Meteor() {
  const eg = useGame((s) => s.endgame)
  if (!eg || eg.won) return null
  const { meteorPos: p, found, open, built, specialty } = eg

  // once a scout has reached it, the star is clickable — opens its menu
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!found || useGame.getState().buildMode !== 'none') return
    e.stopPropagation()
    useGame.getState().selectMeteor()
  }
  const onOver = () => {
    if (found && useGame.getState().buildMode === 'none') document.body.style.cursor = 'pointer'
  }
  const onOut = () => (document.body.style.cursor = 'auto')

  return (
    <group position={[p.x, 0, p.z]} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
      {/* scorched crater */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} raycast={noHit}>
        <circleGeometry args={[7, 36]} />
        <meshStandardMaterial color="#241c16" roughness={1} />
      </mesh>
      {/* invisible click target so the whole star is easy to select once found */}
      {found && (
        <mesh position={[0, 2.4, 0]} visible={false}>
          <cylinderGeometry args={[3.4, 4, 6, 12]} />
        </mesh>
      )}
      {!open && <MeteorRock />}
      {open && !built && <ForgeGlow />}
      {built && specialty === 'magic' && <Portal />}
      {built && specialty === 'tech' && <Starship />}
      <MeteorSmoke />
    </group>
  )
}
