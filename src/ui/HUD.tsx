import { Fragment } from 'react'
import { RESOURCE_TYPES, residencePop, resourceUnlocked, useGame } from '../game/store'
import { TOWN_TIERS } from '../game/config'
import type { ResourceType } from '../game/types'

const LABELS: Record<ResourceType, string> = {
  wood: 'Wood',
  food: 'Food',
  stone: 'Stone',
  mithril: 'Mithril',
  weapons: 'Weapons',
}

export function HUD() {
  const resources = useGame((s) => s.resources)
  const pop = useGame((s) => s.villagers.length)
  const buildings = useGame((s) => s.buildings)
  const tierIndex = useGame((s) => s.tierIndex)
  const tier = TOWN_TIERS[tierIndex]
  const popCap = tier.popCap + residencePop(buildings)
  const cap = tier.storageCap
  const shown = RESOURCE_TYPES.filter((t) => resourceUnlocked(t, tierIndex))

  return (
    <>
      <div className="resource-bar panel">
        {shown.map((t, i) => (
          <Fragment key={t}>
            {i > 0 && <div className="divider" />}
            <div className="res">
              <span className="dot" style={{ background: `var(--${t})` }} />
              <div>
                <div className={resources[t] >= cap ? 'full' : ''}>
                  {Math.floor(resources[t])}
                  <span className="cap">/{cap}</span>
                </div>
                <div className="label">{LABELS[t]}</div>
              </div>
            </div>
          </Fragment>
        ))}
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
