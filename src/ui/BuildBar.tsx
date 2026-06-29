import { OBJECTIVES, useGame } from '../game/store'
import { PRODUCTION, RESIDENCE_ERAS } from '../game/config'
import type { BuildMode, Resources } from '../game/types'

function costText(c: Resources): string {
  return c.food > 0 ? `${c.wood}w · ${c.food}f` : `${c.wood} wood`
}

export function BuildBar() {
  const buildMode = useGame((s) => s.buildMode)
  const setBuildMode = useGame((s) => s.setBuildMode)
  const tierIndex = useGame((s) => s.tierIndex)
  const wood = useGame((s) => s.resources.wood)
  const food = useGame((s) => s.resources.food)
  const step = useGame((s) => s.objectiveStep)
  const hintTool = OBJECTIVES[step]?.tool ?? null

  const era = RESIDENCE_ERAS[tierIndex]
  const lum = PRODUCTION.lumberyard
  const forg = PRODUCTION.forager
  const poor = (c: Resources) => wood < c.wood || food < c.food

  const tools: { mode: BuildMode; label: string; icon: string; hint: string; poor?: boolean }[] = [
    { mode: 'none', label: 'Select', icon: '✋', hint: 'Command, staff & pick up' },
    { mode: 'lumberyard', label: 'Lumberyard', icon: '🪵', hint: `${costText(lum.cost)} · on forest`, poor: poor(lum.cost) },
    { mode: 'forager', label: 'Forager', icon: '🧺', hint: `${costText(forg.cost)} · on berries`, poor: poor(forg.cost) },
    { mode: 'house', label: era.name, icon: '🏠', hint: `${costText(era.buildCost)} · +${era.popBonus}`, poor: poor(era.buildCost) },
    { mode: 'path', label: 'Path', icon: '🛤️', hint: 'Speeds up hauling' },
  ]

  return (
    <div className="build-bar panel">
      <div className="build-bar-title">Build</div>
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
