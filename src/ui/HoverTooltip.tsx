import { prodLevel, useGame } from '../game/store'
import { FIELDS } from '../game/fields'
import { PRODUCTION, FIELD_BUILD_RANGE } from '../game/config'

export function HoverTooltip() {
  const hover = useGame((s) => s.hover)
  const buildings = useGame((s) => s.buildings)
  if (!hover) return null
  const field = FIELDS.find((f) => f.id === hover.fieldId)
  if (!field) return null

  const isForest = field.type === 'forest'
  const def = isForest ? PRODUCTION.lumberyard : PRODUCTION.forager
  const icon = isForest ? '🌲' : '🫐'
  const title = isForest ? 'Forest' : 'Berry field'
  const res = isForest ? 'wood' : 'food'
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
