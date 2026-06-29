import { residencePop, useGame } from '../game/store'
import { TOWN_TIERS, VILLAGER_COST } from '../game/config'

export function ActionPanel() {
  const tierIndex = useGame((s) => s.tierIndex)
  const pop = useGame((s) => s.villagers.length)
  const buildings = useGame((s) => s.buildings)
  const food = useGame((s) => s.resources.food)
  const train = useGame((s) => s.trainVillager)

  const popCap = TOWN_TIERS[tierIndex].popCap + residencePop(buildings)
  const atCap = pop >= popCap
  const canTrain = !atCap && food >= VILLAGER_COST.food

  return (
    <div className="action-panel panel">
      <button className="btn" disabled={!canTrain} onClick={train}>
        <span className="title">Train Villager</span>
        <div className="cost">
          <span className={food >= VILLAGER_COST.food ? 'ok' : 'no'}>
            <b>{VILLAGER_COST.food}</b> food
          </span>
        </div>
        {atCap ? <span className="cost no">No housing — build or upgrade homes</span> : null}
      </button>
    </div>
  )
}
