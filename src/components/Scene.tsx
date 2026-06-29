import { useState } from 'react'
import { MapControls, Sky } from '@react-three/drei'
import { useGame } from '../game/store'
import { Ground } from './Ground'
import { Scenery } from './Scenery'
import { Fields } from './Fields'
import { Territory } from './Territory'
import { TownCenter } from './TownCenter'
import { Villager } from './Villager'
import { Buildings } from './Buildings'
import { Paths } from './Paths'
import { BuildController } from './BuildController'
import { CameraRig } from './CameraRig'
import { IntroCamera } from './IntroCamera'
import { GameLoop } from './GameLoop'

export function Scene() {
  const villagers = useGame((s) => s.villagers)
  const [introDone, setIntroDone] = useState(false)

  return (
    <>
      {/* drives the simulation each frame */}
      <GameLoop />
      <CameraRig />
      {!introDone && <IntroCamera onDone={() => setIntroDone(true)} />}

      <fog attach="fog" args={['#cfe3f0', 55, 130]} />
      <Sky sunPosition={[40, 18, 25]} turbidity={6} rayleigh={1.2} />

      <hemisphereLight args={['#dff0ff', '#5a6b3a', 0.7]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[24, 34, 16]}
        intensity={1.7}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-bias={-0.0004}
      />

      <Ground />
      <Territory />
      <Scenery />
      <Fields />
      <Paths />
      <TownCenter />
      <Buildings />
      <BuildController />

      {villagers.map((v) => (
        <Villager key={v.id} villagerId={v.id} />
      ))}

      {introDone && (
        <MapControls
          target={[0, 0.5, 0]}
          minDistance={5}
          maxDistance={95}
          maxPolarAngle={Math.PI / 2.1}
          makeDefault
        />
      )}
    </>
  )
}
