import { useState } from 'react'
import { OBJECTIVES, resourceUnlocked, stoneUnlocked, useGame } from '../game/store'
import {
  EXPANSION_TIER,
  PRODUCTION,
  RESIDENCE_ERAS,
  SCOUT_UNLOCK_TIER,
  SETTLE_COST,
  VILLAGER_COST,
} from '../game/config'
import type { BuildMode, Resources } from '../game/types'

// compact price for the toolbar, e.g. "25w" or "80w · 45f · 20s"
function costText(c: Partial<Resources>): string {
  const parts: string[] = []
  if (c.wood) parts.push(`${c.wood}w`)
  if (c.food) parts.push(`${c.food}f`)
  if (c.stone) parts.push(`${c.stone}s`)
  if (c.mithril) parts.push(`${c.mithril}mi`)
  return parts.length ? parts.join(' · ') : 'free'
}

interface ToolDef {
  mode: BuildMode
  label: string
  icon: string
  hint: string
  poor?: boolean
}

export function BuildBar() {
  const [resOpen, setResOpen] = useState(false)
  const buildMode = useGame((s) => s.buildMode)
  const setBuildMode = useGame((s) => s.setBuildMode)
  const tierIndex = useGame((s) => s.tierIndex)
  const wood = useGame((s) => s.resources.wood)
  const food = useGame((s) => s.resources.food)
  const stone = useGame((s) => s.resources.stone)
  const buildingCount = useGame((s) => s.buildings.length)
  const hasPaths = useGame((s) => s.paths.length > 0)
  const pop = useGame((s) => s.villagers.length)
  // owned villages raise both caps — re-subscribe so they update live
  useGame((s) => s.npcVillages)
  const buildCap = useGame((s) => s.buildCap())
  const popCap = useGame((s) => s.popCap())
  const step = useGame((s) => s.objectiveStep)
  const train = useGame((s) => s.trainVillager)
  const hintTool = OBJECTIVES[step]?.tool ?? null
  const atCap = buildingCount >= buildCap

  const era = RESIDENCE_ERAS[tierIndex]
  const P = PRODUCTION
  const poor = (c: Partial<Resources>) =>
    wood < (c.wood ?? 0) || food < (c.food ?? 0) || stone < (c.stone ?? 0)

  // tools stay hidden until their resource / age is in play
  const showStone = stoneUnlocked(tierIndex)
  const showMithril = resourceUnlocked('mithril', tierIndex)
  const showOrichalcum = resourceUnlocked('orichalcum', tierIndex)
  const showWeapons = resourceUnlocked('weapons', tierIndex)
  const showSettle = tierIndex >= EXPANSION_TIER
  const scoutUnlocked = tierIndex >= SCOUT_UNLOCK_TIER

  // every resource-producing building lives under the collapsible "Resources" group
  const resourceTools: ToolDef[] = [
    { mode: 'lumberyard', label: 'Lumberyard', icon: '🪵', hint: `${costText(P.lumberyard.cost)} · on forest`, poor: poor(P.lumberyard.cost) },
    { mode: 'forager', label: 'Forager', icon: '🧺', hint: `${costText(P.forager.cost)} · on berries`, poor: poor(P.forager.cost) },
    { mode: 'hunter', label: 'Hunting Camp', icon: '🏹', hint: `${costText(P.hunter.cost)} · hunts game`, poor: poor(P.hunter.cost) },
    ...(showStone ? [{ mode: 'quarry' as const, label: 'Quarry', icon: '🪨', hint: `${costText(P.quarry.cost)} · on rock`, poor: poor(P.quarry.cost) }] : []),
    ...(showMithril ? [{ mode: 'mine' as const, label: 'Mithril Mine', icon: '💎', hint: `${costText(P.mine.cost)} · on mithril`, poor: poor(P.mine.cost) }] : []),
    ...(showOrichalcum ? [{ mode: 'orichalcummine' as const, label: 'Orichalcum Mine', icon: '🔶', hint: `${costText(P.orichalcummine.cost)} · on orichalcum`, poor: poor(P.orichalcummine.cost) }] : []),
    ...(showWeapons ? [{ mode: 'smithy' as const, label: 'Smithy', icon: '⚒️', hint: `${costText(P.smithy.cost)} · mithril→weapons`, poor: poor(P.smithy.cost) }] : []),
  ]

  const renderTool = (t: ToolDef) => {
    const active = buildMode === t.mode
    const nudge = !active && hintTool === t.mode
    return (
      <button
        key={t.mode}
        className={`tool${active ? ' active' : ''}${nudge ? ' nudge' : ''}`}
        onClick={() => setBuildMode(t.mode)}
      >
        <span className="tool-icon">{t.icon}</span>
        <span className="tool-text">
          <span className="tool-label">{t.label}</span>
          <span className={`tool-hint${t.poor ? ' no' : ''}`}>{t.hint}</span>
        </span>
      </button>
    )
  }

  const foodCost = VILLAGER_COST.food ?? 0
  const atPopCap = pop >= popCap
  const canTrain = !atPopCap && food >= foodCost

  return (
    <div className="build-bar panel">
      <div className="build-bar-title">
        Build
        <span className={`build-count${atCap ? ' full' : ''}`}>
          {buildingCount}/{buildCap}
        </span>
      </div>

      {renderTool({ mode: 'none', label: 'Select', icon: '✋', hint: 'Command, staff & pick up' })}

      {/* Resources — collapsible group; opens as a flyout to the side + down */}
      <div className="build-group-wrap">
        <button
          className={`build-group-head${resOpen ? ' open' : ''}`}
          onClick={() => setResOpen((o) => !o)}
        >
          <span className="build-group-head-left">
            <span className="tool-icon">🛠</span>
            <span className="tool-label">Resources</span>
          </span>
          <span className="chev">▸</span>
        </button>
        {resOpen && <div className="build-flyout panel">{resourceTools.map(renderTool)}</div>}
      </div>

      <div className="build-divider" />

      {/* Town — homes & people */}
      {renderTool({ mode: 'house', label: era.name, icon: '🏠', hint: `${costText(era.buildCost)} · +${era.popBonus} housing`, poor: poor(era.buildCost) })}
      <button className="tool" disabled={!canTrain} onClick={train}>
        <span className="tool-icon">👤</span>
        <span className="tool-text">
          <span className="tool-label">Train Villager</span>
          <span className={`tool-hint${!canTrain ? ' no' : ''}`}>
            {atPopCap ? 'no housing — build homes' : `${foodCost}f · +1 villager`}
          </span>
        </span>
      </button>

      <div className="build-divider" />

      {/* Expand — reach & roads */}
      {showSettle && renderTool({ mode: 'settle', label: 'Settle', icon: '⛺', hint: `${costText(SETTLE_COST)} · new town`, poor: poor(SETTLE_COST) })}
      {scoutUnlocked &&
        renderTool({
          mode: 'scout',
          label: 'Send Scout',
          icon: '🧭',
          hint: buildMode === 'scout' ? 'click the map · Esc to cancel' : 'explore the map',
        })}
      {renderTool({ mode: 'path', label: 'Path', icon: '🛤️', hint: 'Speeds up hauling' })}
      {hasPaths &&
        renderTool({ mode: 'erasePath', label: 'Erase Path', icon: '🧹', hint: 'click a road to remove it' })}
    </div>
  )
}
