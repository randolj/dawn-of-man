import { Canvas } from '@react-three/fiber'
import { Scene } from './components/Scene'
import { HUD } from './ui/HUD'
import { ActionPanel } from './ui/ActionPanel'
import { BuildBar } from './ui/BuildBar'
import { BuildingPanel } from './ui/BuildingPanel'
import { Objectives } from './ui/Objectives'
import { Toasts } from './ui/Toasts'
import { Welcome } from './ui/Welcome'
import { HoverTooltip } from './ui/HoverTooltip'
import { Persistence } from './ui/Persistence'
import { DebugMenu } from './ui/DebugMenu'

export default function App() {
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
        <HUD />
        <BuildBar />
        <ActionPanel />
        <BuildingPanel />
        <Objectives />
        <Toasts />
        <Welcome />
        <HoverTooltip />
        <DebugMenu />
      </div>
      <Persistence />
    </>
  )
}
