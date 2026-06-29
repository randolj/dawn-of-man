# 3D Village Maker — agent guide

A browser **3D god game**: command villagers, build a village, advance through eras,
expand your territory. Long-term arc → a country of villages, NPC tribes, diplomacy &
war. **Stack:** React 18 + TypeScript + Vite, three.js via @react-three/fiber + drei,
zustand. Single-page, no backend.

## Commands

```bash
npm run dev      # dev server on http://localhost:5173
npm run build    # tsc -b + vite build (run before declaring done)
npx tsc -b       # typecheck only (noUnusedLocals is on — unused locals fail)
```

## Where things live

- `src/game/store.ts` — **the heart.** zustand store = all gameplay state + the single
  `tick(dt)` simulation (villager AI, hauling, production, wandering). Most logic changes
  happen here. Exposes `window.__game` / `window.__roadConnected` in dev.
- `src/game/config.ts` — **all tunable content as data:** `TOWN_TIERS`, `RESIDENCE_ERAS`,
  `PRODUCTION` (per-level), speeds, costs, radii. Adding an era / residence model /
  production level / building is an **append to an array**, not new code.
- `src/game/types.ts` — core shapes (Villager, Building, TownTier, etc.).
- `src/game/fields.ts`, `scenery.ts` — deterministic (seeded) world generation.
- `src/components/*` — R3F scene: one file per visual thing (Villager, Buildings,
  TownCenter, Territory, Fields, SoloTrees, Production/Residence models, BuildController,
  CameraRig, IntroCamera, …). `Scene.tsx` mounts everything; `GameLoop.tsx` calls `tick`.
- `src/ui/*` — DOM overlay (HUD, BuildBar, BuildingPanel, Objectives, Toasts, …).

## Conventions that matter

- **Meshes read state LIVE, not via props.** In a component's `useFrame`, call
  `useGame.getState()` and copy `villager.pos` etc. onto the mesh ref. This keeps movement
  smooth with **no React re-renders per frame**. React only re-renders on *discrete*
  changes (a delivery, an upgrade, a new building) — those go through `set()`.
- **One simulation, one place.** Don't scatter game logic into components; put it in
  `tick()` (or a store action). Components render; the store decides.
- **Data-driven first.** Prefer adding a config entry over branching logic.
- **Single village (for now).** The townhall is hardcoded at `TOWN_CENTER = {0,0}`;
  resources/tierIndex/territory are one global pool. Making villages first-class
  (Phase 3 of the roadmap) is the next big refactor — keep that in mind.

## Verifying changes (read this — the preview is quirky)

The Claude preview tab **pauses `requestAnimationFrame` when backgrounded**, so the
camera intro never finishes, **MapControls never mounts**, and animations freeze. Plan
around it:

- **Verify game logic via the store**, not the UI: drive the sim with
  `window.__game.getState().tick(0.025)` in a loop, then read state. This is reliable and
  how most features here were verified.
- **Force a single render** by dispatching a `resize` event (`window.dispatchEvent(new
  Event('resize'))`) — useful before a screenshot so meshes snap to current sim positions.
- **Synthetic pointer events don't drive R3F raycasting or OrbitControls** reliably, so
  real click/drag/camera interactions can't be fully reproduced here — verify those by
  construction + a real browser.
- Always finish with `npx tsc -b` and `npm run build`.

## Gotchas learned the hard way

- **Don't reuse generic CSS class names.** A button class `hint` collided with a leftover
  `.hint` rule and broke layout. Namespace UI classes (`tool-nudge`, `bp-btn`, …).
- The dev preview's console buffer keeps **stale HMR errors** from earlier edits — confirm
  the app is actually broken (DOM unmounted) before chasing a logged error.
- `tsc -b` emits `vite.config.js/.d.ts` + `*.tsbuildinfo` (composite project) — gitignored.

## Roadmap & vision

See **README.md** ("How to play" + roadmap) and the project memory for the full long-term
arc (territory → regions → scouts/multi-village → NPCs → diplomacy → combat). Phase 1
(territory/borders) is built.
