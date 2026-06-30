import { useEffect, useState } from 'react'
import { useGame } from '../game/store'
import { TOWN_TIERS } from '../game/config'

// Hidden behind the Konami code: ↑ ↑ ↓ ↓ ← → ← → B A toggles the menu.
const CODE = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
]

export function DebugMenu() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let buf: string[] = []
    const onKey = (e: KeyboardEvent) => {
      buf.push(e.key.toLowerCase())
      if (buf.length > CODE.length) buf = buf.slice(-CODE.length)
      if (buf.length === CODE.length && CODE.every((c, i) => c === buf[i])) {
        setOpen((o) => !o)
        buf = []
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null

  return (
    <div className="debug-menu panel">
      <div className="debug-head">
        <span>🛠 Debug menu</span>
        <span className="bp-close" onClick={() => setOpen(false)}>
          ×
        </span>
      </div>
      <div className="debug-sub">Jump to an era — rebuilds a representative base.</div>
      <div className="debug-grid">
        {TOWN_TIERS.map((t, i) => (
          <button
            key={i}
            className="btn debug-btn"
            onClick={() => useGame.getState().debugSetupEra(i)}
          >
            {t.name}
            <span>{t.era}</span>
          </button>
        ))}
      </div>
      <div className="debug-actions">
        <button className="btn debug-btn" onClick={() => useGame.getState().debugDiscoverAll()}>
          Reveal all villages
        </button>
        <button className="btn debug-btn" onClick={() => useGame.getState().saveGame()}>
          Save now
        </button>
        <button className="btn debug-btn" onClick={() => useGame.getState().resetGame()}>
          New game (wipe save)
        </button>
      </div>
    </div>
  )
}
