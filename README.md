# FluxRun

FluxRun is a pipe-connection roguelite: lay pipes from a queue, seal an energy route from source to drain, prime the flow, then rush a hover tank along your circuit while fighting turrets and drones. Clear three sectors per run, pick relics between boards, and chase meta unlocks.

## Run Loop

Each run spans **3 sectors** with this loop:

1. **Build** — place pipes on a 16×11 grid; compare YOUR trace vs shortest vs loop-potential routes.
2. **Flow** — open the valve; water floods the sealed route; leaks cost hull layers unless relics say otherwise.
3. **Rush ready** — review weapon/energy preview; **Enter/FLOW** to launch or **Esc** to cancel and adjust the board.
4. **Rush** — strafe, aim, boost, auto-fire along your route; reservoirs/crosses/one-ways trigger on-route effects.
5. **Relic pick** — after clearing a sector (when eligible), choose one of three unlocked relics for the rest of the run.

Sector 2+ may require routes to pass **energy wells** (uncovered wells show a red warning ring). The final sector is a **boss** rush.

## Run Modes (URL)

| URL | Mode |
|-----|------|
| `/` | **Free run** — random seed each load |
| `/?daily` | **Daily challenge** — same board for everyone today |
| `/?seed=12345` | **Fixed seed** — reproducible board |

HUD shows `FREE RUN`, `DAILY`, or `SEED …` in the sector label. Meta progress (best score, runs played, daily best) persists in `localStorage`.

## Controls

| Phase | Keys |
|-------|------|
| Build | WASD/arrows move cursor · Q/E rotate · Space place · Tab/NEXT skip · Enter/FLOW open valve · V view |
| Flow | Place ahead of water · Space/Shift/FAST speed flow |
| Rush ready | Enter/FLOW launch · Esc cancel |
| Rush | WASD strafe · right-click aim · Space/Shift/FAST boost |
| Global | P/Esc pause · R/RST restart · M mute · 1/2/3 relic pick |

Touch controls mirror ROT, PLACE, NEXT, FLOW, VIEW, RST, stick, and FAST.

## Relics & Meta

- 20 relics unlock over multiple runs (`unlockAfterRuns`); new unlocks appear on the end screen.
- Relics stack for the current run only; meta tracks best score, sectors reached, and unlocked relic pool.
- Route relics (loop hunter, check valve, etc.) apply via centralized modifiers — HUD energy matches your **actual trace**.

## Development

```bash
npm install --cache .npm-cache
npm run dev
```

Open http://127.0.0.1:5188 (add `?daily` or `?seed=12345` as needed).

## Verification

```bash
npm run build
npm test
```

`npm test` runs Vitest unit tests plus Playwright E2E. Append `?debug` for lil-gui tuning.
