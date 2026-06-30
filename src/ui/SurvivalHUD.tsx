import { useGame } from '../game/store'

function Goal({ icon, label, have, goal }: { icon: string; label: string; have: number; goal: number }) {
  const pct = Math.min(100, (have / goal) * 100)
  const done = have >= goal
  return (
    <div className="survival-goal">
      <div className="survival-goal-label">
        <span>
          {icon} {label}
        </span>
        <span className={done ? 'survival-goal-done' : ''}>
          {Math.floor(have)} / {goal}
        </span>
      </div>
      <div className="survival-bar">
        <div className={`survival-bar-fill${done ? ' done' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** the first-person "found a new city" overlay shown while refounding */
export function SurvivalHUD() {
  const refounding = useGame((s) => s.refounding)
  const wood = useGame((s) => s.resources.wood)
  const food = useGame((s) => s.resources.food)
  if (!refounding) return null

  const ready = wood >= refounding.woodGoal && food >= refounding.foodGoal

  return (
    <>
      <div className="survival-crosshair" />
      <div className="survival">
        <div className="survival-banner">Your capital has fallen</div>
        <div className="survival-sub">
          One survivor remains. Harvest wood &amp; food, then raise a new town hall.
        </div>
        <div className="survival-goals">
          <Goal icon="🪵" label="Wood" have={wood} goal={refounding.woodGoal} />
          <Goal icon="🍎" label="Food" have={food} goal={refounding.foodGoal} />
        </div>
        <button
          className="btn survival-found"
          disabled={!ready}
          onClick={() => useGame.getState().foundNewCity()}
        >
          {ready ? '⚒ Found New City  (F)' : 'Harvest more to rebuild…'}
        </button>
        <div className="survival-hint">
          <b>Click</b> to look · <b>WASD</b> move · <b>mouse</b> aim · <b>left-click</b> chop / pick /
          hunt · <b>Esc</b> release{ready ? ' · ' : ''}
          {ready && <b>F to found</b>}
        </div>
      </div>
    </>
  )
}
