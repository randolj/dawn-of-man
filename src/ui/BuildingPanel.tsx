import { useEffect, useReducer, type ReactNode } from 'react'
import {
  isProduction,
  prodLevel,
  productionUpgradeAvailable,
  resourceUnlocked,
  useGame,
} from '../game/store'
import { MAX_PARTY, PRODUCTION, RESIDENCE_ERAS, TOWN_TIERS } from '../game/config'
import type { Resources, ResourceType } from '../game/types'

const COST_ORDER: ResourceType[] = ['wood', 'food', 'stone', 'mithril']

// NPC resources tick up in-place (no store re-render), so poll for a live view
function NpcPanelBody({ id }: { id: number }) {
  const [, force] = useReducer((x) => x + 1, 0)
  const clear = useGame((s) => s.clearSelection)
  useEffect(() => {
    const t = setInterval(force, 300)
    return () => clearInterval(t)
  }, [])
  const g = useGame.getState()
  const v = g.npcVillages.find((x) => x.id === id)
  if (!v) return null
  const tier = TOWN_TIERS[v.tierIndex]
  const owned = v.owner === 'player'
  const idle = g.villagers.filter(
    (x) => x.state === 'idle' && x.workplaceId === null && x.forageFieldId === null,
  ).length
  const party = Math.min(idle, Math.floor(g.resources.weapons), MAX_PARTY)
  // mirrors the combat formula: defenders scaled by the village's age
  const defense = Math.ceil(v.villagers.length * (0.8 + v.tierIndex * 0.25))
  const canAttack = resourceUnlocked('weapons', g.tierIndex)
  return (
    <>
      <div className="bp-head">
        <div>
          <div className="bp-title">{v.name}</div>
          <div className="bp-sub">
            {tier.era} · {owned ? 'in your realm' : 'neutral village'}
          </div>
        </div>
        <span className="bp-close" onClick={clear}>
          ×
        </span>
      </div>
      <div className="bp-stats">
        <span>👥 {v.villagers.length}</span>
        <span>🪵 {Math.floor(v.resources.wood)}</span>
        <span>🍎 {Math.floor(v.resources.food)}</span>
        {v.resources.stone > 0 && <span>🪨 {Math.floor(v.resources.stone)}</span>}
      </div>
      {owned ? (
        <div className="bp-note">⚜ Joined your realm — it sends you tribute.</div>
      ) : (
        <>
          {v.influence > 0 && (
            <div className="bp-influence">
              <div className="bp-influence-label">Conversion {Math.floor(v.influence)}%</div>
              <div className="bp-bar">
                <div className="bp-bar-fill" style={{ width: `${v.influence}%` }} />
              </div>
            </div>
          )}
          <div className="bp-actions">
            <button
              className="btn bp-btn"
              disabled={idle < 1}
              onClick={() => useGame.getState().sendMissionary(id)}
            >
              <span className="title">Send Missionary</span>
              <span className="bp-note">{idle < 1 ? 'no idle villager' : 'convert it peacefully'}</span>
            </button>
            {canAttack && (
              <button
                className="btn bp-btn"
                disabled={party < 1}
                onClick={() => useGame.getState().attackVillage(id)}
              >
                <span className="title">Attack · defends {defense}</span>
                <span className="bp-note">
                  {party < 1 ? 'need idle villagers + weapons' : `muster ${party} soldiers`}
                </span>
              </button>
            )}
          </div>
        </>
      )}
    </>
  )
}

function Cost({ cost }: { cost: Partial<Resources> }) {
  const resources = useGame((s) => s.resources)
  return (
    <span className="bp-cost">
      {COST_ORDER.filter((t) => (cost[t] ?? 0) > 0).map((t) => (
        <span key={t} className={resources[t] >= (cost[t] ?? 0) ? 'ok' : 'no'}>
          {cost[t]} {t}
        </span>
      ))}
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
  } else if (selection.kind === 'npc') {
    body = <NpcPanelBody id={selection.id} />
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
                {b.workers.length}/{lvl.slots} workers · {lvl.load} {PRODUCTION[b.kind].produces}/trip
              </div>
              {PRODUCTION[b.kind].consumes && (
                <div className="bp-sub">
                  uses{' '}
                  {COST_ORDER.filter((t) => (PRODUCTION[b.kind].consumes![t] ?? 0) > 0)
                    .map((t) => `${PRODUCTION[b.kind].consumes![t]} ${t}`)
                    .join(' + ')}{' '}
                  per trip
                </div>
              )}
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
