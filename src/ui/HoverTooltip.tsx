import { prodLevel, resourceUnlocked, stoneUnlocked, useGame } from '../game/store'
import { FIELDS } from '../game/fields'
import { PRODUCTION, FIELD_BUILD_RANGE } from '../game/config'

export function HoverTooltip() {
  const hover = useGame((s) => s.hover)
  const buildings = useGame((s) => s.buildings)
  const tierIndex = useGame((s) => s.tierIndex)
  if (!hover) return null
  const field = FIELDS.find((f) => f.id === hover.fieldId)
  if (!field) return null
  // resource deposits read as plain scenery until their resource is unlocked
  if (field.type === 'rock' && !stoneUnlocked(tierIndex)) return null
  if (field.type === 'mithrildeposit' && !resourceUnlocked('mithril', tierIndex)) return null

  const meta = {
    forest: { def: PRODUCTION.lumberyard, icon: '🌲', title: 'Forest', res: 'wood' },
    berryfield: { def: PRODUCTION.forager, icon: '🫐', title: 'Berry field', res: 'food' },
    rock: { def: PRODUCTION.quarry, icon: '⛰️', title: 'Rock outcrop', res: 'stone' },
    mithrildeposit: { def: PRODUCTION.mine, icon: '💎', title: 'Mithril deposit', res: 'mithril' },
  }[field.type]
  const { def, icon, title, res } = meta
  const buildName = def.levels[0].name

  // is there already a matching workplace on this field?
  const here = buildings.find(
    (b) =>
      b.kind === def.kind &&
      Math.hypot(b.pos.x - field.pos.x, b.pos.z - field.pos.z) <= field.radius + FIELD_BUILD_RANGE,
  )
  const lvl = here ? prodLevel(here) : null

  return (
    <div className="field-tip" style={{ left: hover.x + 14, top: hover.y + 16 }}>
      <div className="field-tip-title">
        {icon} {title}
      </div>
      {here && lvl ? (
        <div className="field-tip-sub">
          {lvl.name} · {here.workers.length}/{lvl.slots} workers — click to manage
        </div>
      ) : (
        <div className="field-tip-sub">
          Yields <b>{res}</b> · click (or drag a villager) for one load — slow; build a{' '}
          <b>{buildName}</b> for steady output
        </div>
      )}
    </div>
  )
}
