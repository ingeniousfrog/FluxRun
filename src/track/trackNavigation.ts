import type { TrackSample } from './types';

export type NearestSampleOptions = {
  /** Only search forward along the loop from `hint` — prevents wrap-around snaps on closed circuits. */
  readonly forwardOnly?: boolean;
};

function forwardArcSteps(from: number, to: number, count: number): number {
  return (to - from + count) % count;
}

export function findNearestSampleIndex(
  samples: ReadonlyArray<TrackSample>,
  x: number,
  z: number,
  hint: number,
  radius = 36,
  options: NearestSampleOptions = {},
): number {
  const count = samples.length;
  if (count === 0) return 0;

  const forwardOnly = options.forwardOnly ?? false;
  const searchRadius = forwardOnly
    ? Math.min(radius, Math.max(8, Math.floor(count / 2) - 1))
    : radius;

  let best = hint;
  let bestDist = Infinity;
  let bestArc = Infinity;

  const start = forwardOnly ? 0 : -searchRadius;
  const end = searchRadius;

  for (let i = start; i <= end; i += 1) {
    const idx = (hint + i + count) % count;
    const sample = samples[idx];
    const dx = x - sample.position.x;
    const dz = z - sample.position.z;
    const dist = dx * dx + dz * dz;
    const arc = forwardOnly ? i : Math.abs(i);
    if (
      dist < bestDist - 0.25
      || (dist <= bestDist + 0.25 && arc < bestArc)
    ) {
      bestDist = dist;
      bestArc = arc;
      best = idx;
    }
  }

  if (bestDist > 64) {
    for (let idx = 0; idx < count; idx += 1) {
      const sample = samples[idx];
      const dx = x - sample.position.x;
      const dz = z - sample.position.z;
      const dist = dx * dx + dz * dz;
      const arc = forwardArcSteps(hint, idx, count);
      const backward = arc > count / 2;
      if (forwardOnly && backward && dist > bestDist + 4) continue;
      if (
        dist < bestDist - 0.25
        || (dist <= bestDist + 0.25 && arc < bestArc)
      ) {
        bestDist = dist;
        bestArc = arc;
        best = idx;
      }
    }
  }

  return best;
}

export function sampleAtOffset(
  samples: ReadonlyArray<TrackSample>,
  index: number,
  offset: number,
): TrackSample {
  const count = samples.length;
  return samples[(index + offset + count) % count];
}

export function crossTrackError(sample: TrackSample, x: number, z: number): number {
  return (x - sample.position.x) * sample.normal.x + (z - sample.position.z) * sample.normal.z;
}

export function findStartGridSampleIndex(
  samples: ReadonlyArray<TrackSample>,
  x: number,
  z: number,
  trackLength: number,
): number {
  let best = 0;
  let bestDist = Infinity;
  const window = Math.max(12, Math.floor(samples.length * 0.08));

  for (let i = 0; i < window; i += 1) {
    for (const idx of [i, (samples.length - i) % samples.length]) {
      const sample = samples[idx];
      if (sample.s > trackLength * 0.18 && i > 0) continue;
      const dx = x - sample.position.x;
      const dz = z - sample.position.z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        best = idx;
      }
    }
  }

  return best;
}
