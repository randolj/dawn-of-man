import { Canvas } from '@react-three/fiber'
import { useGame } from './game/store'
import { Scene } from './components/Scene'
import { HUD } from './ui/HUD'
import { BuildBar } from './ui/BuildBar'
import { BuildingPanel } from './ui/BuildingPanel'
import { Objectives } from './ui/Objectives'
import { Toasts } from './ui/Toasts'
import { Welcome } from './ui/Welcome'
import { HoverTooltip } from './ui/HoverTooltip'
import { Persistence } from './ui/Persistence'
import { DebugMenu } from './ui/DebugMenu'
import { SettlementsBar } from './ui/SettlementsBar'
import { SurvivalHUD } from './ui/SurvivalHUD'
import { EndgamePanel } from './ui/EndgamePanel'
import { SpeedControl } from './ui/SpeedControl'

export default function App() {
  // the normal god-game HUD is hidden while you're the lone survivor
  const refounding = useGame((s) => s.refounding)
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [14, 13, 14], fov: 45 }}
        gl={{ antialias: true }}
      >
        <Scene />
      </Canvas>

      <div className="ui-layer">
        {!refounding && (
          <>
            <HUD />
            <BuildBar />
            <BuildingPanel />
            <Objectives />
            <SettlementsBar />
            <EndgamePanel />
            <SpeedControl />
          </>
        )}
        <Toasts />
        <Welcome />
        <HoverTooltip />
        <DebugMenu />
        <SurvivalHUD />
      </div>
      <Persistence />
    </>
  )
}
