import { useEffect, useReducer, useState, type ReactNode } from 'react'
import {
  isProduction,
  prodLevel,
  productionUpgradeAvailable,
  resourceUnlocked,
  useGame,
} from '../game/store'
import { MAX_PARTY, PRODUCTION, RESIDENCE_ERAS, TOWN_TIERS } from '../game/config'
import type { Resources, ResourceType } from '../game/types'

const COST_ORDER: ResourceType[] = ['wood', 'food', 'stone', 'mithril', 'orichalcum']

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
  // for an owned outpost: how many of your villagers are stationed here, and its tribute trickle
  const garrison = owned
    ? g.villagers.filter(
        (x) => Math.hypot(x.pos.x - v.center.x, x.pos.z - v.center.z) <= v.territoryRadius,
      ).length
    : 0
  const tribute =
    v.income.wood + v.income.food + v.income.stone + v.income.mithril + v.income.weapons
  // an owned village advances era-by-era, but never past your own capital's age
  const nextVillageTier = TOWN_TIERS[v.tierIndex + 1]
  const villageBlockedByCapital = !!nextVillageTier && v.tierIndex + 1 > g.tierIndex
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
        <>
          <div className="bp-note">⚜ A town in your realm — develop it like your own capital.</div>
          <div className="bp-stats">
            <span>🛡 {garrison} stationed</span>
            <span>📈 +{tribute.toFixed(1)}/s tribute</span>
          </div>
          <div className="bp-actions">
            {nextVillageTier?.upgradeCost ? (
              villageBlockedByCapital ? (
                <button className="btn bp-btn" disabled>
                  <span className="title">Advance → {nextVillageTier.name}</span>
                  <span className="bp-note">raise your own town to the {nextVillageTier.era} first</span>
                </button>
              ) : (
                <button className="btn bp-btn" onClick={() => useGame.getState().upgradeVillage(id)}>
                  <span className="title">Advance → {nextVillageTier.name}</span>
                  <Cost cost={nextVillageTier.upgradeCost} />
                  <span className="bp-note">
                    +{nextVillageTier.popCap} housing · wider borders · {nextVillageTier.era}
                  </span>
                </button>
              )
            ) : (
              <div className="bp-note">Highest age reached.</div>
            )}
          </div>
          <div className="bp-note">
            Build inside its borders, or muster a war party here to strike the next village.
          </div>
        </>
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

// two-click demolish so a stray click never razes a building outright
function DemolishButton({ id }: { id: number }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      className={`btn bp-btn bp-demolish${armed ? ' armed' : ''}`}
      onClick={() => (armed ? useGame.getState().demolishBuilding(id) : setArmed(true))}
    >
      <span className="title">{armed ? 'Confirm demolish' : 'Demolish'}</span>
      <span className="bp-note">
        {armed ? 'click again to tear it down' : 'free the slot · reclaim half the materials'}
      </span>
    </button>
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
  if (selection.kind === 'meteor') return null // the star has its own EndgamePanel

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
            ) : b.kind === 'starforge' ? (
              <div className="bp-note">The fallen star — there is but one.</div>
            ) : (
              <div className="bp-note">Highest level.</div>
            )}
            {/* the Starforge can't be rebuilt, so it can't be razed */}
            {b.kind !== 'starforge' && <DemolishButton key={b.id} id={b.id} />}
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
          <div className="bp-actions">
            {outdated && next?.upgradeCost ? (
              <button className="btn bp-btn" onClick={() => useGame.getState().upgradeResidence(b.id)}>
                <span className="title">Upgrade → {next.name}</span>
                <Cost cost={next.upgradeCost} />
                <span className="bp-note">houses {next.popBonus} people</span>
              </button>
            ) : (
              <div className="bp-note">Up to date for this age.</div>
            )}
            <DemolishButton key={b.id} id={b.id} />
          </div>
        </>
      )
    }
  }

  return <div className="build-panel panel">{body}</div>
}
