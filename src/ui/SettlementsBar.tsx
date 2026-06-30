import { TOWN_CENTER, useGame } from '../game/store'
import { TOWN_TIERS } from '../game/config'

// A quick switcher for YOUR settlements — capital + every village you hold.
// Clicking one flies the camera to it and opens its management panel.
export function SettlementsBar() {
  const villages = useGame((s) => s.npcVillages)
  const tierIndex = useGame((s) => s.tierIndex)
  const selection = useGame((s) => s.selection)

  const owned = villages.filter((v) => v.owner === 'player')
  if (owned.length === 0) return null // only your capital — nothing to switch between yet

  const goCapital = () => {
    useGame.getState().focusCamera({ x: TOWN_CENTER.x, z: TOWN_CENTER.z })
    useGame.getState().selectTownhall()
  }
  const goVillage = (id: number, center: { x: number; z: number }) => {
    useGame.getState().focusCamera(center)
    useGame.getState().selectNpc(id)
  }

  return (
    <div className="settlements panel">
      <div className="settlements-title">Your settlements</div>
      <button
        className={`settle-row${selection?.kind === 'townhall' ? ' active' : ''}`}
        onClick={goCapital}
      >
        <span className="settle-dot">⚜</span>
        <span className="settle-name">
          Capital
          <span>{TOWN_TIERS[tierIndex].era}</span>
        </span>
      </button>
      {owned.map((v) => (
        <button
          key={v.id}
          className={`settle-row${selection?.kind === 'npc' && selection.id === v.id ? ' active' : ''}`}
          onClick={() => goVillage(v.id, v.center)}
        >
          <span className="settle-dot">⚜</span>
          <span className="settle-name">
            {v.name}
            <span>{TOWN_TIERS[v.tierIndex].era}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
