import { residencePop, useGame } from '../game/store'
import { SCOUT_UNLOCK_TIER, TOWN_TIERS, VILLAGER_COST } from '../game/config'

export function ActionPanel() {
  const tierIndex = useGame((s) => s.tierIndex)
  const pop = useGame((s) => s.villagers.length)
  const buildings = useGame((s) => s.buildings)
  const food = useGame((s) => s.resources.food)
  const train = useGame((s) => s.trainVillager)
  const buildMode = useGame((s) => s.buildMode)
  const setBuildMode = useGame((s) => s.setBuildMode)

  const foodCost = VILLAGER_COST.food ?? 0
  const popCap = TOWN_TIERS[tierIndex].popCap + residencePop(buildings)
  const atCap = pop >= popCap
  const canTrain = !atCap && food >= foodCost
  const scoutUnlocked = tierIndex >= SCOUT_UNLOCK_TIER // hidden before the Mithril Age
  const aiming = buildMode === 'scout'

  return (
    <div className="action-panel panel">
      <button className="btn" disabled={!canTrain} onClick={train}>
        <span className="title">Train Villager</span>
        <div className="cost">
          <span className={food >= foodCost ? 'ok' : 'no'}>
            <b>{foodCost}</b> food
          </span>
        </div>
        {atCap ? <span className="cost no">No housing — build or upgrade homes</span> : null}
      </button>
      {scoutUnlocked && (
        <button
          className={`btn${aiming ? ' active' : ''}`}
          onClick={() => setBuildMode(aiming ? 'none' : 'scout')}
        >
          <span className="title">Send Scout</span>
          <span className="cost">{aiming ? 'click the map (Esc to cancel)' : 'click a spot to explore'}</span>
        </button>
      )}
    </div>
  )
}
