import { useGame } from '../game/store'

// A small always-visible fast-forward control. The sim is substepped by this
// multiplier in GameLoop, so the whole world (production, hauling, wandering,
// the Starforge grind) runs proportionally faster.
const SPEEDS = [1, 2, 4]

export function SpeedControl() {
  const speed = useGame((s) => s.gameSpeed)
  return (
    <div className="speed-control panel">
      {SPEEDS.map((n) => (
        <button
          key={n}
          className={'speed-btn' + (speed === n ? ' active' : '')}
          onClick={() => useGame.getState().setGameSpeed(n)}
        >
          {n}×
        </button>
      ))}
    </div>
  )
}
