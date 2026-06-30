import { RESOURCE_TYPES, useGame } from '../game/store'
import { PRODUCTION, TOWN_TIERS } from '../game/config'

// The fallen-star endgame, surfaced as DOM prompts that follow the Endgame state
// machine: open the meteor -> forge & choose a path -> send your people -> victory.
// The interactive prompts open only when the meteor is selected (click the star),
// so they never sit on top of the settlement menus; victory is always full-screen.

export function EndgamePanel() {
  const eg = useGame((s) => s.endgame)
  const resources = useGame((s) => s.resources)
  const tierIndex = useGame((s) => s.tierIndex)
  const villages = useGame((s) => s.npcVillages)
  const buildings = useGame((s) => s.buildings)
  const selection = useGame((s) => s.selection)

  if (!eg || !eg.found) return null

  const cap = TOWN_TIERS[tierIndex].storageCap

  // ---- victory screen (always front-and-centre once won) ----
  if (eg.won) {
    const magic = eg.specialty === 'magic'
    return (
      <div className="victory-screen">
        <div className="victory-card">
          <div className="victory-kicker">{magic ? 'The portal blazes' : 'The engines ignite'}</div>
          <h1 className="victory-title">Your people ascend</h1>
          <p className="victory-body">
            {magic
              ? 'One by one, your villagers step through the shimmering gate and vanish into the light of another world.'
              : 'One by one, your villagers board the starship. It lifts from the crater on a pillar of fire and climbs into the stars.'}
          </p>
          <p className="victory-sub">From a single hut to the edge of the heavens. The age of your village is complete.</p>
          <button className="btn victory-btn" onClick={() => useGame.getState().resetGame()}>
            Begin anew
          </button>
        </div>
      </div>
    )
  }

  // the interactive prompts are only shown while the star is selected
  if (selection?.kind !== 'meteor') return null
  const close = () => useGame.getState().clearSelection()
  const Close = () => (
    <span className="eg-close" onClick={close}>
      ×
    </span>
  )

  // ---- the great work is built: send the people ----
  if (eg.built) {
    const magic = eg.specialty === 'magic'
    return (
      <div className="endgame-prompt panel">
        <Close />
        <div className="eg-kicker">{magic ? 'A portal stands open' : 'A starship awaits'}</div>
        <div className="eg-title">{magic ? 'The Portal' : 'The Starship'}</div>
        <p className="eg-body">
          {magic
            ? 'The Starmetal has torn a doorway into the multiverse. Your people are ready to walk through.'
            : 'The Starmetal is forged into a vessel for the void. Your people are ready to leave this world.'}
        </p>
        <button className="btn eg-btn eg-go" onClick={() => useGame.getState().sendPeople()}>
          {magic ? 'Send your people through' : 'Send your people to the stars'}
        </button>
      </div>
    )
  }

  // ---- forge is open: staff it, fill Starmetal, then choose a path ----
  if (eg.open) {
    const ready = resources.starmetal >= cap
    const forge = buildings.find((b) => b.kind === 'starforge')
    const workers = forge?.workers.length ?? 0
    const slots = PRODUCTION.starforge.levels[forge?.level ?? 0]?.slots ?? 3
    const outOfInput = resources.orichalcum <= 0 || resources.mithril <= 0
    return (
      <div className="endgame-prompt panel">
        <Close />
        <div className="eg-kicker">The Starforge burns</div>
        <div className="eg-title">Forge the Starmetal</div>
        <p className="eg-body">
          Assign smiths to the forge — each fuses 1 orichalcum + 1 mithril into Starmetal. Fill the store, then choose
          the fate of your people.
        </p>
        <button
          className="btn eg-btn eg-staff"
          disabled={workers >= slots}
          onClick={() => forge && useGame.getState().staffBuilding(forge.id)}
        >
          ⚒ Assign smith — {workers}/{slots} working
        </button>
        <div className="eg-meter">
          <div className="eg-meter-fill" style={{ width: `${Math.min(100, (resources.starmetal / cap) * 100)}%` }} />
          <span className="eg-meter-label">
            {Math.floor(resources.starmetal)} / {cap} Starmetal
          </span>
        </div>
        {outOfInput && workers > 0 && (
          <div className="eg-hint">The forge is starved — mine more orichalcum + mithril to keep it burning.</div>
        )}
        <div className="eg-choices">
          <button
            className="btn eg-btn eg-magic"
            disabled={!ready}
            onClick={() => useGame.getState().chooseSpecialty('magic')}
          >
            ✦ Magic — open a portal
          </button>
          <button
            className="btn eg-btn eg-tech"
            disabled={!ready}
            onClick={() => useGame.getState().chooseSpecialty('tech')}
          >
            ◈ Technology — build a starship
          </button>
        </div>
        {!ready && <div className="eg-hint">Fill the Starmetal store to unlock your choice.</div>}
      </div>
    )
  }

  // ---- meteor found, not yet opened: conquer + max everything ----
  const total = villages.length
  const owned = villages.filter((v) => v.owner === 'player').length
  const allOwned = owned >= total
  const fullTypes = RESOURCE_TYPES.filter((t) => t !== 'starmetal' && resources[t] >= cap).length
  const totalTypes = RESOURCE_TYPES.filter((t) => t !== 'starmetal').length
  const allFull = fullTypes >= totalTypes
  const canOpen = allOwned && allFull

  return (
    <div className="endgame-prompt panel">
      <Close />
      <div className="eg-kicker">A scout has reached the crater</div>
      <div className="eg-title">The Fallen Star</div>
      <p className="eg-body">
        Something sleeps within the meteor. To wake it you must rule the entire continent and pour every storehouse you
        own into the star — all of it, to the last grain.
      </p>
      <div className="eg-reqs">
        <div className={'eg-req' + (allOwned ? ' done' : '')}>
          <span className="eg-check">{allOwned ? '✓' : '○'}</span>
          Conquer every village
          <span className="eg-count">
            {owned}/{total}
          </span>
        </div>
        <div className={'eg-req' + (allFull ? ' done' : '')}>
          <span className="eg-check">{allFull ? '✓' : '○'}</span>
          Fill every storehouse
          <span className="eg-count">
            {fullTypes}/{totalTypes}
          </span>
        </div>
      </div>
      <button className="btn eg-btn eg-go" disabled={!canOpen} onClick={() => useGame.getState().openMeteor()}>
        Open the Star — give everything
      </button>
      {!canOpen && <div className="eg-hint">Opening the star drains every storehouse to nothing.</div>}
    </div>
  )
}
