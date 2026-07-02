# FluxRun

FluxRun is a procedural arcade racer inspired by realistic browser racers (Kenney Starter Kit / Raycast vehicle style): random circuits, weather, and physics-based rear-wheel-drive handling.

## Realism Features

- **Raycast vehicle** (`cannon-es`): suspension, weight transfer, rear-wheel drive
- **Four-wheel car model**: steering front wheels, spinning tires, body roll
- **Handbrake drifting** (hold Space): rear wheel lock + tire smoke + skid marks
- **Chase camera** with velocity lead and speed-based FOV
- **Engine audio** pitch follows throttle and speed

## Run Loop

1. **Countdown** — 3 seconds to the green light (`Enter` skips).
2. **Race** — drive 3 laps; weather changes grip and visibility.
3. **Finish** — best lap and total time are saved locally.

## Track Types

Each seed generates one of three layouts:

| Layout | Feel |
|--------|------|
| `oval` | Long straights + sweeping turns |
| `circuit` | Mixed straights, arcs, and chicanes |
| `technical` | Tighter corners, shorter straights |

Tracks are flat ribbon meshes with shoulders, barriers, and a start/finish line.

## Weather

| Type | Effect |
|------|--------|
| Clear | Baseline grip |
| Rain / Storm | Lower grip, rain particles |
| Fog | Reduced visibility |
| Snow | Lowest grip, snow particles |

## URL Modes

| URL | Mode |
|-----|------|
| `/` | Random seed each load |
| `/?daily` | Same track for everyone today |
| `/?seed=228` | Fixed reproducible track |
| `/?weather=storm` | Force weather (`clear`, `rain`, `fog`, `storm`, `snow`) |

## Controls

| Input | Action |
|-------|--------|
| W / Up | Throttle |
| S / Down | Brake |
| A / D | Steer |
| Shift | Boost |
| Space (hold) | Handbrake / drift |
| Enter | Skip countdown |
| P / Esc | Pause |
| R | New random track |
| M | Mute |

Touch: left stick to steer/throttle, **BOOST** for shift, **RST** to restart.

## Development

```bash
npm install --cache .npm-cache
npm run dev
```

Open http://127.0.0.1:5188 (add `?seed=228` or `?daily` as needed).

## Verification

```bash
npm run build
npm test
```

`npm test` runs Vitest unit tests plus Playwright E2E.
