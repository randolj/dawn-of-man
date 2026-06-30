import { useEffect } from 'react'
import { useGame } from '../game/store'

// Autosaves the game to localStorage (the store loads any save on startup).
// No UI — just lifecycle. Saves on an interval, on tab-hide, and on unload.
export function Persistence() {
  useEffect(() => {
    const save = () => useGame.getState().saveGame()
    const id = window.setInterval(save, 4000)
    const onHide = () => {
      if (document.visibilityState === 'hidden') save()
    }
    window.addEventListener('beforeunload', save)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('beforeunload', save)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])
  return null
}
