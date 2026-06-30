import { Fragment } from 'react'
import { RESOURCE_TYPES, residencePop, resourceUnlocked, useGame } from '../game/store'
import { TOWN_TIERS } from '../game/config'
import type { ResourceType } from '../game/types'

const LABELS: Record<ResourceType, string> = {
  wood: 'Wood',
  food: 'Food',
  stone: 'Stone',
  mithril: 'Mithril',
  orichalcum: 'Orichalcum',
  starmetal: 'Starmetal',
  weapons: 'Weapons',
}

export function HUD() {
  const resources = useGame((s) => s.resources)
  const pop = useGame((s) => s.villagers.length)
  const tierIndex = useGame((s) => s.tierIndex)
  const buildings = useGame((s) => s.buildings)
  const npcVillages = useGame((s) => s.npcVillages)
  const forgeOpen = useGame((s) => s.endgame?.open ?? false)
  const tier = TOWN_TIERS[tierIndex]
  // total housing = capital tier + your homes + EVERY owned village's tier housing
  const popCap =
    tier.popCap +
    residencePop(buildings) +
    npcVillages.reduce((sum, v) => sum + (v.owner === 'player' ? TOWN_TIERS[v.tierIndex].popCap : 0), 0)
  const cap = tier.storageCap
  // starmetal is hidden until the Starforge cracks open; then it joins the bar
  const shown = RESOURCE_TYPES.filter((t) => (t === 'starmetal' ? forgeOpen : resourceUnlocked(t, tierIndex)))

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
