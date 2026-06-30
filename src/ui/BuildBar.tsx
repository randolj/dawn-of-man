import { OBJECTIVES, resourceUnlocked, stoneUnlocked, useGame } from '../game/store'
import { PRODUCTION, RESIDENCE_ERAS, TOWN_TIERS } from '../game/config'
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

export function BuildBar() {
  const buildMode = useGame((s) => s.buildMode)
  const setBuildMode = useGame((s) => s.setBuildMode)
  const tierIndex = useGame((s) => s.tierIndex)
  const wood = useGame((s) => s.resources.wood)
  const food = useGame((s) => s.resources.food)
  const stone = useGame((s) => s.resources.stone)
  const buildingCount = useGame((s) => s.buildings.length)
  const step = useGame((s) => s.objectiveStep)
  const hintTool = OBJECTIVES[step]?.tool ?? null
  const buildCap = TOWN_TIERS[tierIndex].buildCap
  const atCap = buildingCount >= buildCap

  const era = RESIDENCE_ERAS[tierIndex]
  const lum = PRODUCTION.lumberyard
  const forg = PRODUCTION.forager
  const quar = PRODUCTION.quarry
  const hunt = PRODUCTION.hunter
  const mine = PRODUCTION.mine
  const smithy = PRODUCTION.smithy
  const poor = (c: Partial<Resources>) =>
    wood < (c.wood ?? 0) || food < (c.food ?? 0) || stone < (c.stone ?? 0)

  // tools stay hidden until their resource is in play
  const showStone = stoneUnlocked(tierIndex)
  const showMithril = resourceUnlocked('mithril', tierIndex)
  const showWeapons = resourceUnlocked('weapons', tierIndex)
  const tools: { mode: BuildMode; label: string; icon: string; hint: string; poor?: boolean }[] = [
    { mode: 'none', label: 'Select', icon: '✋', hint: 'Command, staff & pick up' },
    { mode: 'lumberyard', label: 'Lumberyard', icon: '🪵', hint: `${costText(lum.cost)} · on forest`, poor: poor(lum.cost) },
    { mode: 'forager', label: 'Forager', icon: '🧺', hint: `${costText(forg.cost)} · on berries`, poor: poor(forg.cost) },
    { mode: 'hunter', label: 'Hunting Camp', icon: '🏹', hint: `${costText(hunt.cost)} · hunts game`, poor: poor(hunt.cost) },
    ...(showStone
      ? [{ mode: 'quarry' as const, label: 'Quarry', icon: '⛏️', hint: `${costText(quar.cost)} · on rock`, poor: poor(quar.cost) }]
      : []),
    ...(showMithril
      ? [{ mode: 'mine' as const, label: 'Mithril Mine', icon: '⛏️', hint: `${costText(mine.cost)} · on mithril`, poor: poor(mine.cost) }]
      : []),
    ...(showWeapons
      ? [{ mode: 'smithy' as const, label: 'Smithy', icon: '⚒️', hint: `${costText(smithy.cost)} · mithril→weapons`, poor: poor(smithy.cost) }]
      : []),
    { mode: 'house', label: era.name, icon: '🏠', hint: `${costText(era.buildCost)} · +${era.popBonus}`, poor: poor(era.buildCost) },
    { mode: 'path', label: 'Path', icon: '🛤️', hint: 'Speeds up hauling' },
  ]

  return (
    <div className="build-bar panel">
      <div className="build-bar-title">
        Build
        <span className={`build-count${atCap ? ' full' : ''}`}>
          {buildingCount}/{buildCap}
        </span>
      </div>
      {tools.map((t) => {
        const active = buildMode === t.mode
        const hint = !active && hintTool === t.mode
        return (
          <button
            key={t.mode}
            className={`tool${active ? ' active' : ''}${hint ? ' nudge' : ''}`}
            onClick={() => setBuildMode(t.mode)}
          >
            <span className="tool-icon">{t.icon}</span>
            <span className="tool-text">
              <span className="tool-label">{t.label}</span>
              <span className={`tool-hint${t.poor ? ' no' : ''}`}>{t.hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
