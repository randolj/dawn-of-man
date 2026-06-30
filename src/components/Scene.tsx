import { useState } from 'react'
import { MapControls, Sky } from '@react-three/drei'
import { TOWN_CENTER, useGame } from '../game/store'
import { Ground } from './Ground'
import { Scenery } from './Scenery'
import { Fields } from './Fields'
import { Territory } from './Territory'
import { TownCenter } from './TownCenter'
import { NpcVillages } from './NpcVillages'
import { Meteor } from './Meteor'
import { FogOfWar } from './FogOfWar'
import { Animals } from './Animals'
import { Villager } from './Villager'
import { Buildings } from './Buildings'
import { Paths } from './Paths'
import { BuildController } from './BuildController'
import { CameraRig } from './CameraRig'
import { IntroCamera } from './IntroCamera'
import { SurvivorController } from './SurvivorController'
import { GameLoop } from './GameLoop'

export function Scene() {
  const villagers = useGame((s) => s.villagers)
  const refounding = useGame((s) => s.refounding)
  const [introDone, setIntroDone] = useState(false)

  return (
    <>
      {/* drives the simulation each frame */}
      <GameLoop />
      <CameraRig />
      <SurvivorController />
      {!introDone && <IntroCamera onDone={() => setIntroDone(true)} />}

      <fog attach="fog" args={['#cfe3f0', 130, 320]} />
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
      <NpcVillages />
      <Meteor />
      <Animals />
      <Buildings />
      <BuildController />
      <FogOfWar />

      {villagers.map((v) => (
        <Villager key={v.id} villagerId={v.id} />
      ))}

      {/* the god's orbit camera — yielded to first person while refounding, and
          re-centred on the capital wherever it currently stands */}
      {introDone && !refounding && (
        <MapControls
          target={[TOWN_CENTER.x, 0.5, TOWN_CENTER.z]}
          minDistance={5}
          maxDistance={150}
          maxPolarAngle={Math.PI / 2.1}
          makeDefault
        />
      )}
    </>
  )
}
