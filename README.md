# FluxRun

FluxRun is a lightweight pipe-connection roguelite built around one shared board: place pipes from a queue, seal an energy route from source to drain, prime the flow, then rush a hover tank along your circuit while fighting turrets and drones.

## Current Playable Slice

- **Build** on a 16×11 grid with locked source and drain, rotating single-cell pipes, a visible next-pipe queue, skip penalties, and replacement of unflooded pipes.
- **Energy routing** via color chains, reservoirs, and crosses — shown as energy and multiplier on the HUD.
- **Flow** primes the sealed route cell by cell; water locks flooded pipes; leaks cost integrity; Space/FAST speeds pressure.
- **Rush** launches the hover tank along the sealed loop with strafe, boost, auto-fire, and enemy waves tied to route multiplier.
- 2D top-down or toggleable 2.5D angled camera on the same board.
- Procedural neon-industrial Three.js scene with route highlights, VFX, and Web Audio synthesis.

## Run

```bash
npm install --cache .npm-cache
npm run dev
```

Open http://127.0.0.1:5188.

## Controls

- **Build**: WASD/arrows move cursor, Q/E rotate, Space places, Tab/NEXT skips pipe, Enter/FLOW opens valve when route is ready, V toggles 2D/2.5D.
- **Flow**: keep placing pipes ahead of the water; flooded cells lock; Space/Shift/FAST speeds flow.
- **Rush**: WASD/strafe dodge, Space/Shift/FAST boost, auto-fire chains kills with route multiplier.
- **Touch**: stick moves cursor; ROT, PLACE, NEXT, FLOW, VIEW, RST, and FAST mirror keyboard actions.

## Verification

```bash
npm run build
npm audit --audit-level=high
npm test
npm run inspect:canvas -- --url http://127.0.0.1:5188 --out artifacts/canvas-inspection --wait 1200
npm run inspect:canvas -- --url http://127.0.0.1:5188 --out artifacts/canvas-inspection --mobile --wait 1200
```

Append `?debug` to the URL for lil-gui tuning (rush speed, fire rate, camera lag).
