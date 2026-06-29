import { residencePop, useGame } from '../game/store'
import { TOWN_TIERS } from '../game/config'

export function HUD() {
  const wood = useGame((s) => s.resources.wood)
  const food = useGame((s) => s.resources.food)
  const pop = useGame((s) => s.villagers.length)
  const buildings = useGame((s) => s.buildings)
  const tierIndex = useGame((s) => s.tierIndex)
  const tier = TOWN_TIERS[tierIndex]
  const popCap = tier.popCap + residencePop(buildings)
  const cap = tier.storageCap

  return (
    <>
      <div className="resource-bar panel">
        <div className="res">
          <span className="dot" style={{ background: 'var(--wood)' }} />
          <div>
            <div className={wood >= cap ? 'full' : ''}>
              {Math.floor(wood)}
              <span className="cap">/{cap}</span>
            </div>
            <div className="label">Wood</div>
          </div>
        </div>
        <div className="divider" />
        <div className="res">
          <span className="dot" style={{ background: 'var(--food)' }} />
          <div>
            <div className={food >= cap ? 'full' : ''}>
              {Math.floor(food)}
              <span className="cap">/{cap}</span>
            </div>
            <div className="label">Food</div>
          </div>
        </div>
        <div className="divider" />
        <div className="res">
          <span className="dot" style={{ background: '#9aa7ff' }} />
          <div>
            <div>
              {pop}/{popCap}
            </div>
            <div className="label">People</div>
          </div>
        </div>
      </div>

      <div className="era-badge panel">
        <div className="tier">{tier.name}</div>
        <div className="era">{tier.era}</div>
      </div>
    </>
  )
}
