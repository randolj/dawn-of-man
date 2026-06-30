import { useFrame } from '@react-three/fiber'
import { useGame } from '../game/store'

/**
 * Single point that advances the whole simulation. Lives inside the Canvas so
 * it gets a real per-frame delta. Villager / node meshes read positions live
 * from the store (via getState) so they stay smooth without React re-renders.
 */
export function GameLoop() {
  const tick = useGame((s) => s.tick)
  useFrame((_, delta) => {
    // clamp delta so a tabbed-out pause doesn't teleport everyone
    const dt = Math.min(delta, 0.05)
    // fast-forward by substepping whole ticks (keeps movement/routing stable
    // vs. one giant dt) — speed is read live so changes take effect instantly
    const speed = useGame.getState().gameSpeed
    for (let i = 0; i < speed; i++) tick(dt)
  })
  return null
}
