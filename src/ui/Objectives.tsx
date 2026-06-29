import { useEffect, useState } from 'react'
import { OBJECTIVES, useGame } from '../game/store'

export function Objectives() {
  const step = useGame((s) => s.objectiveStep)
  const [collapsed, setCollapsed] = useState(false)
  // start centered to grab attention, then slide to the top-right corner
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setIntro(false), 2600)
    return () => clearTimeout(id)
  }, [])
  if (step >= OBJECTIVES.length) return null

  if (collapsed) {
    return (
      <div className="objectives panel collapsed" onClick={() => setCollapsed(false)}>
        <div className="objectives-head">
          <span>
            Getting Started <span className="obj-count">· {step}/{OBJECTIVES.length}</span>
          </span>
          <span className="collapse-toggle" title="Expand">
            ▸
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={`objectives panel${intro ? ' intro' : ''}`}>
      <div className="objectives-head">
        <span>Getting Started</span>
        <span className="collapse-toggle" title="Collapse" onClick={() => setCollapsed(true)}>
          ▾
        </span>
      </div>
      <ul className="obj-list">
        {OBJECTIVES.map((o, i) => {
          const state = i < step ? 'done' : i === step ? 'current' : 'todo'
          return (
            <li key={o.id} className={`obj ${state}`}>
              <span className="mark">{i < step ? '✓' : i === step ? '▶' : '○'}</span>
              <span className="obj-title">{o.title}</span>
            </li>
          )
        })}
      </ul>
      <div className="objectives-foot">
        Drag to pan · <b>WASD</b> move · scroll zoom · drag a villager to move them
      </div>
    </div>
  )
}
