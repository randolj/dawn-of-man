# 3D Village Maker

A browser-based 3D god game. You command villagers around a campfire to gather
resources, then spend those resources to grow your population and upgrade your
settlement through the ages (Campfire → Tent → Longhouse → … → futuristic).

This repo is the **vertical-slice prototype**: the full core loop is playable,
and the rest of the design (more eras, new buildings, multiple villages, roads,
tech/magic branches) is meant to layer on as _data_, not engine rewrites.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle
```

## How to play

On first load a brief **camera intro** frames the campfire with a one-line
welcome, and the **Getting Started** checklist makes a centered entrance before
settling top-right. That checklist plus **toasts** (which confirm actions and
explain failures) walk new players through the loop. Click/scroll skips the intro.

- **Bootstrap & manual gathering** → you start with almost no wood. **Drag a villager
  onto a forest** to chop it by hand (slow), or onto a berry field to gather food.
  This works any time — it's just inefficient, so it's your early bootstrap and a
  fallback.
- **Produce** → for real output, build a **Lumberyard** on a forest or a **Forager's
  Hut** on a berry field. They start tiny (1 worker) and **upgrade** as your town
  advances — more worker slots (up to 3) and more output per worker. Always better
  than gathering by hand.
- **Manage anything by clicking it** → click a building (or the townhall) to select
  it; a panel shows its stats and **Hire / Upgrade** buttons with costs. A gold
  **beacon** over a building means there's something to do there.
- **Haul & roads** → workers carry each load to the townhall to fill your stores.
  Lay a **Path** from the workplace to the townhall and they **follow the road**
  and move ~2× faster; with no road they walk straight and slow (a faint dashed line
  hints where to build one).
- **Storage cap** → each town tier caps how much wood/food you can stockpile
  (shown as X/cap in the top bar). Deliveries stop counting once you're full —
  upgrade the townhall to store more.
- **Hover** a forest or berry field for a tooltip; **drag a villager** (hand of god)
  to relocate them or drop them on a workplace to employ them.
- **Build** (left toolbar) → place **residences** and lay **paths**. Residences are
  themed by era (Lean-to → Tent → Hut → House → Cottage); older ones gain an upgrade
  beacon when you advance — click to rebuild them into the new era for more capacity.
- **Territory** → your village has a claimed area (border posts + a soft tint) and
  you can only build inside it. **Upgrading the townhall expands your borders**, so
  advancing the era literally grows the land you control.
- **Train Villager** (bottom panel) and **upgrade the townhall** (click it) to grow
  the population, advance through the eras, and widen your borders.
- **Explore** → **WASD/arrows** to roam, **left-drag** to pan, **right-drag** to
  rotate, **scroll** to zoom. Mountains ring the horizon.

## Tech stack

- **React + TypeScript** (Vite)
- **three.js** via **@react-three/fiber** (declarative 3D) + **@react-three/drei**
- **zustand** for game state

## Architecture

```
src/
  game/
    types.ts     # core data shapes (Villager, Building, ResourceField, TownTier…)
    config.ts    # ALL tunable numbers: eras, residences, PRODUCTION, speeds
    fields.ts    # deterministic forests & berry fields
    scenery.ts   # deterministic mountains / decorative trees / rocks
    store.ts     # zustand store: world state + the per-frame simulation tick
  components/
    Scene.tsx        # lights, camera, fog, sky + mounts everything
    GameLoop.tsx     # single useFrame that advances the whole sim
    CameraRig.tsx    # WASD/arrow panning on top of MapControls
    TownCenter.tsx   # campfire / townhall, swaps visuals per tier
    Villager.tsx     # one villager; mirrors sim position onto the mesh
    Fields.tsx       # forests & berry fields (non-interactive)
    Buildings.tsx    # residences + production buildings, worker slots, beacons
    Residence.tsx    # tent/hut/house/cottage models
    Production.tsx   # lumberyard / forager models
    BuildController.tsx # ground cursor, placement clicks, ghosts, drops
    Paths.tsx, Ground.tsx, Scenery.tsx
  ui/
    HUD.tsx, BuildBar.tsx, ActionPanel.tsx, Instructions.tsx
```

### The one idea that makes it extensible

The simulation lives in a single `tick(dt)` in `store.ts`. Meshes read villager
positions _live_ from the store inside their own `useFrame` (via
`useGame.getState()`), so movement is smooth without per-frame React re-renders;
React only re-renders on discrete changes (a delivery, an upgrade, a new villager).

The economy is a production loop: **field → workplace → worker → haul → inventory.**
Workers produce a load at a building then carry it to the townhall; the per-frame
`onRoad()` check gives them a speed boost while travelling on a `path`.

## Extending it (each of these is a small, local change)

- **Add an era / town-center tier** → append to `TOWN_TIERS` in `config.ts`.
- **Add a residence era** → append to `RESIDENCE_ERAS` (model/cost/capacity).
- **Add a production building** → add an entry to `PRODUCTION` in `config.ts`
  (field type, output, cost, work time, load, slots), give it a model in
  `Production.tsx`, and add it to `BuildMode` + the `BuildBar`. The worker AI and
  hauling in `tick` are generic over the `ProductionDef`.
- **Add a resource field type** → extend `FieldType` and `fields.ts`.

## Roadmap

Done:
- ✅ Explorable world (mountains, scenery, free RTS camera + keyboard pan)
- ✅ Hand-of-god pickup / drag-to-employ
- ✅ Era-themed residences (raise pop cap, upgrade in place)
- ✅ Drawable paths that **speed up hauling**
- ✅ Production economy: forests/berry fields → lumberyard/forager → workers haul to townhall

Next:
1. **Animal taming / pastures** — better food sources (user's idea).
2. **Forest depletion + replanting** — feeds a sustainability branch.
3. **Path → road tiers** — bump segment `level` for even faster transport.
4. **Mines / quarries** — new resources (stone, ore) and fields.
5. **Scouts & new villages**, then a **tech tree** gating tech/magic/sustainability.

## Dev notes

- In dev, the store is exposed as `window.__game` for console debugging
  (`window.__game.getState()`). This is gated behind `import.meta.env.DEV`.
