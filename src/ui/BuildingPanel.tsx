import type { ReactNode } from 'react'
import { isProduction, prodLevel, productionUpgradeAvailable, useGame } from '../game/store'
import { PRODUCTION, RESIDENCE_ERAS, TOWN_TIERS } from '../game/config'
import type { Resources } from '../game/types'

function Cost({ cost }: { cost: Resources }) {
  const wood = useGame((s) => s.resources.wood)
  const food = useGame((s) => s.resources.food)
  return (
    <span className="bp-cost">
      <span className={wood >= cost.wood ? 'ok' : 'no'}>{cost.wood} wood</span>
      {cost.food > 0 && <span className={food >= cost.food ? 'ok' : 'no'}>{cost.food} food</span>}
    </span>
  )
}

export function BuildingPanel() {
  const selection = useGame((s) => s.selection)
  const buildings = useGame((s) => s.buildings)
  const tierIndex = useGame((s) => s.tierIndex)
  // subscribe so affordability/labels refresh live
  useGame((s) => s.resources)
  const clear = useGame((s) => s.clearSelection)

  if (!selection) return null

  let body: ReactNode = null

  if (selection.kind === 'townhall') {
    const tier = TOWN_TIERS[tierIndex]
    const next = TOWN_TIERS[tierIndex + 1]
    body = (
      <>
        <div className="bp-head">
          <div>
            <div className="bp-title">{tier.name}</div>
            <div className="bp-sub">{tier.era} · Town center</div>
          </div>
          <span className="bp-close" onClick={clear}>
            ×
          </span>
        </div>
        <div className="bp-stats">
          <span>👥 {tier.popCap} base people</span>
          <span>📦 {tier.storageCap} storage</span>
        </div>
        {next?.upgradeCost ? (
          <button className="btn bp-btn" onClick={() => useGame.getState().upgradeTownCenter()}>
            <span className="title">Upgrade → {next.name}</span>
            <Cost cost={next.upgradeCost} />
            <span className="bp-note">{next.popCap} people · {next.storageCap} storage · {next.era}</span>
          </button>
        ) : (
          <div className="bp-note">Highest tier reached.</div>
        )}
      </>
    )
  } else {
    const b = buildings.find((x) => x.id === selection.id)
    if (!b) return null

    if (isProduction(b)) {
      const lvl = prodLevel(b)!
      const levels = PRODUCTION[b.kind].levels
      const next = levels[b.level + 1]
      const unlocked = productionUpgradeAvailable(b, tierIndex)
      const slotFree = b.workers.length < lvl.slots
      body = (
        <>
          <div className="bp-head">
            <div>
              <div className="bp-title">{lvl.name}</div>
              <div className="bp-sub">
                {b.workers.length}/{lvl.slots} workers · {lvl.load} {b.kind === 'lumberyard' ? 'wood' : 'food'}/trip
              </div>
            </div>
            <span className="bp-close" onClick={clear}>
              ×
            </span>
          </div>
          <div className="bp-actions">
            <button
              className="btn bp-btn"
              disabled={!slotFree}
              onClick={() => useGame.getState().staffBuilding(b.id)}
            >
              <span className="title">Hire worker</span>
              <span className="bp-note">{slotFree ? 'assign an idle villager' : 'all slots full'}</span>
            </button>
            {next ? (
              unlocked && next.upgradeCost ? (
                <button className="btn bp-btn" onClick={() => useGame.getState().upgradeProduction(b.id)}>
                  <span className="title">Upgrade → {next.name}</span>
                  <Cost cost={next.upgradeCost} />
                  <span className="bp-note">{next.slots} workers · {next.load}/trip</span>
                </button>
              ) : (
                <button className="btn bp-btn" disabled>
                  <span className="title">Next: {next.name}</span>
                  <span className="bp-note">unlocks in the {TOWN_TIERS[next.reqTier].era}</span>
                </button>
              )
            ) : (
              <div className="bp-note">Highest level.</div>
            )}
          </div>
        </>
      )
    } else {
      // residence
      const era = RESIDENCE_ERAS[b.level]
      const outdated = b.level < tierIndex
      const next = RESIDENCE_ERAS[b.level + 1]
      body = (
        <>
          <div className="bp-head">
            <div>
              <div className="bp-title">{era.name}</div>
              <div className="bp-sub">houses {era.popBonus} people</div>
            </div>
            <span className="bp-close" onClick={clear}>
              ×
            </span>
          </div>
          {outdated && next?.upgradeCost ? (
            <button className="btn bp-btn" onClick={() => useGame.getState().upgradeResidence(b.id)}>
              <span className="title">Upgrade → {next.name}</span>
              <Cost cost={next.upgradeCost} />
              <span className="bp-note">houses {next.popBonus} people</span>
            </button>
          ) : (
            <div className="bp-note">Up to date for this age.</div>
          )}
        </>
      )
    }
  }

  return <div className="build-panel panel">{body}</div>
}
