# FluxRun

FluxRun is a lightweight pipe-connection roguelite prototype built around one shared board: place the current pipe from a queue, rotate it into a sealed route, then open the valve yourself to guide the flow from the source to the drain.

## Current Playable Slice

- Build phase on a 16x11 grid with a locked source and drain, movable cursor, rotating single-cell pipes, a visible next-pipe queue, skip penalties, replacement of unflooded pipes, and no automatic water release.
- Flow phase inspired by classic pipe-connecting games: water advances cell by cell, flooded pipes lock, empty cells or wrong connectors leak, and the route must reach the drain after a target length.
- Starts in 2D top-down mode like a classic pipe puzzle, with a toggleable 2.5D angled camera for the same board.
- Procedural neon-industrial scene using Three.js with pipe modules, preview route highlights, filled-water route highlights, industrial framing, and event VFX.
- HUD for phase, pipe length target, valve state, view mode, leak count, score, current pipe, next queue, rule tips, sound toggle, and touch controls.
- Local Web Audio synthesis for placement, rotation, flow start, hits, combos, fail, clear, and ambience. No external keys or runtime API calls are required.

## Run

```bash
npm install --cache .npm-cache
npm run dev
```

Open http://127.0.0.1:5188.

## Controls

- Build: WASD/arrow keys move the pipe cursor, Q/E rotate, Space places the current pipe, Tab skips to the next queued pipe, Enter opens the valve only after the route reaches the drain, V toggles 2D/2.5D.
- Flow: keep placing pipes ahead of the water. Flooded pipes cannot be replaced. Space/Shift or FAST speeds pressure if you want to risk it.
- Touch: stick moves the cursor; ROT, PLACE, NEXT, FLOW, VIEW, RST, and FAST mirror the keyboard flow.

## Verification

```bash
npm run build
npm audit --audit-level=high
npm test
npm run inspect:canvas -- --url http://127.0.0.1:5188 --out artifacts/canvas-inspection --wait 1200
npm run inspect:canvas -- --url http://127.0.0.1:5188 --out artifacts/canvas-inspection --mobile --wait 1200
```
