import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture } from 'three'
import { TOWN_CENTER, useGame } from '../game/store'
import { WORLD_RADIUS } from '../game/scenery'
import { REVEAL_RADIUS, TOWN_TIERS, VILLAGE_REVEAL_RADIUS } from '../game/config'

// A classic RTS fog-of-war: a dark ground plane whose alpha is driven by an
// "explored" mask painted on a canvas. White = fogged, black = revealed. The
// scout paints reveal as it travels (breadcrumbs in store.explored); your
// territory is always clear. Unexplored areas are hidden until you scout them.

const TEX = 256
const SPAN = WORLD_RADIUS * 2 + 40 // world units the mask covers (+margin past the edge)
const HOME_MARGIN = 12 // reveal a little beyond your borders so home never fogs

const noHit = () => null

export function FogOfWar() {
  // first person reveals the whole map — no darkened areas while refounding
  const refounding = useGame((s) => s.refounding)
  const drawn = useRef(0) // how many explored breadcrumbs we've painted
  const drawnTier = useRef(-1)
  const drawnHome = useRef({ x: NaN, z: NaN }) // capital spot last revealed (moves on refound)
  const revealedVillages = useRef<Set<number>>(new Set()) // discovered villages already cleared

  const { ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TEX
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, TEX, TEX) // everything starts fogged
    const texture = new CanvasTexture(canvas)
    return { ctx, texture }
  }, [])

  // world coordinate -> canvas pixel (same formula on both axes; see store notes)
  const toPx = (w: number) => ((w + SPAN / 2) / SPAN) * TEX

  const reveal = (wx: number, wz: number, r: number) => {
    const cx = toPx(wx)
    const cy = toPx(wz)
    const cr = (r / SPAN) * TEX
    const grad = ctx.createRadialGradient(cx, cy, cr * 0.35, cx, cy, cr)
    grad.addColorStop(0, '#000000') // fully revealed
    grad.addColorStop(1, '#ffffff') // fades back into fog
    ctx.globalCompositeOperation = 'darken' // only ever clears, never re-fogs
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, cr, 0, Math.PI * 2)
    ctx.fill()
  }

  useFrame(() => {
    const g = useGame.getState()
    let dirty = false

    const ex = g.explored
    // a shorter list than what we've drawn means the game was reset/loaded
    if (ex.length < drawn.current) {
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, TEX, TEX)
      drawn.current = 0
      drawnTier.current = -1
      drawnHome.current = { x: NaN, z: NaN }
      revealedVillages.current.clear()
      dirty = true
    }

    // your claimed land is always explored (grows with the tier; moves if refounded)
    if (
      g.tierIndex !== drawnTier.current ||
      TOWN_CENTER.x !== drawnHome.current.x ||
      TOWN_CENTER.z !== drawnHome.current.z
    ) {
      reveal(TOWN_CENTER.x, TOWN_CENTER.z, TOWN_TIERS[g.tierIndex].territoryRadius + HOME_MARGIN)
      drawnTier.current = g.tierIndex
      drawnHome.current = { x: TOWN_CENTER.x, z: TOWN_CENTER.z }
      dirty = true
    }

    for (let i = drawn.current; i < ex.length; i++) {
      reveal(ex[i].x, ex[i].z, REVEAL_RADIUS)
      dirty = true
    }
    drawn.current = ex.length

    // discovering a village clears a large area around it (a one-time burst)
    for (const village of g.npcVillages) {
      if (village.discovered && !revealedVillages.current.has(village.id)) {
        reveal(village.center.x, village.center.z, VILLAGE_REVEAL_RADIUS)
        revealedVillages.current.add(village.id)
        dirty = true
      }
    }

    // clear smoothly right at any active scout
    for (const v of g.villagers) {
      if (v.state === 'scouting') {
        reveal(v.pos.x, v.pos.z, REVEAL_RADIUS)
        dirty = true
      }
    }

    if (dirty) texture.needsUpdate = true
  })

  if (refounding) return null // whole map visible in first person

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]} raycast={noHit}>
      <planeGeometry args={[SPAN, SPAN]} />
      <meshBasicMaterial color="#2b3346" transparent opacity={0.82} alphaMap={texture} depthWrite={false} />
    </mesh>
  )
}
