# FluxRun

FluxRun is a lightweight 3D roguelite prototype built around one shared board: place pipe tetrominoes, route energy through color-coded modules, then launch a hover tank along the circuit to trigger boosts, reflections, chain scoring, and bullet-hell combat.

## Current Playable Slice

- Build phase with a seeded starter route, movable cursor, rotating pipe tetrominoes, blocked-cell validation, and same-color 3-in-a-row module upgrades.
- Rush phase where the hover tank follows the connected route, strafes laterally, boosts, auto-fires, dodges enemy projectiles, and scores through route multiplier plus chain bonuses.
- Procedural 2.5D neon-industrial scene using Three.js: authored hover tank, pipe modules, charged route highlights, industrial world kit, three enemy silhouettes, projectiles, and event VFX.
- HUD for phase, route length, energy, multiplier/chain, hull, score, current module, relics, sound toggle, and touch controls.
- Local Web Audio synthesis for placement, rotation, rush, shots, hits, combos, fail, clear, and ambience. No external keys or runtime API calls are required.

## Run

```bash
npm install --cache .npm-cache
npm run dev
```

Open http://127.0.0.1:5188.

## Controls

- Build: WASD/arrow keys move the module cursor, Q/E rotate, Space places a module, Enter starts the rush.
- Rush: A/D or arrow keys strafe, Space/Shift boost, P/Escape pause, R restarts to build.
- Touch: stick moves/strafe; ROT, SET, RUN, RST, and BST buttons mirror the keyboard flow.

## Verification

```bash
npm run build
npm audit --audit-level=high
npm test
npm run inspect:canvas -- --url http://127.0.0.1:5188 --out artifacts/canvas-inspection --wait 1200
npm run inspect:canvas -- --url http://127.0.0.1:5188 --out artifacts/canvas-inspection --mobile --wait 1200
```
