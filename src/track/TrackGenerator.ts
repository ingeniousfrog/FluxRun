import * as THREE from 'three';
import type { GeneratedTrack, TrackLayout, TrackSample } from './types';

const TRACK_NAMES: Record<TrackLayout, string[]> = {
  oval: ['Pulse Oval', 'Delta Ring', 'Sunset Speedway', 'Chrome Loop'],
  circuit: ['Skyline Circuit', 'Mirage Run', 'Neon Loop', 'Ghost Coast'],
  technical: ['Rust Belt', 'Drift Harbor', 'Ion Spur', 'Chrome Pass'],
};

const SAMPLE_COUNT = 256;
const TRACK_HALF_WIDTH = 5;
const MIN_CORNER_RADIUS = 22;
const CLOSE_TOLERANCE = 5;

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

function pickLayout(rng: Rng): TrackLayout {
  const roll = rng();
  if (roll < 0.28) return 'oval';
  if (roll < 0.62) return 'circuit';
  return 'technical';
}

function buildOvalPoints(rng: Rng): THREE.Vector3[] {
  const straight = range(rng, 50, 75);
  const radius = range(rng, 28, 40);
  const points: THREE.Vector3[] = [];
  const push = (x: number, z: number) => points.push(new THREE.Vector3(x, 0, z));

  push(-straight / 2, radius);
  for (let i = 1; i < 8; i += 1) {
    const a = Math.PI / 2 + (i / 8) * Math.PI;
    push(-straight / 2 + Math.cos(a) * radius, Math.sin(a) * radius);
  }
  push(straight / 2, -radius);
  for (let i = 1; i < 8; i += 1) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    push(straight / 2 + Math.cos(a) * radius, -radius + Math.sin(a) * radius);
  }
  return points;
}

function buildCircuitPoints(rng: Rng): THREE.Vector3[] {
  const points: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0)];
  let heading = range(rng, 0, Math.PI * 2);
  let x = 0;
  let z = 0;
  const segmentCount = 8 + Math.floor(rng() * 4);

  for (let i = 0; i < segmentCount; i += 1) {
    const kind = rng();
    if (kind < 0.45) {
      const len = range(rng, 42, 78);
      x += Math.sin(heading) * len;
      z += Math.cos(heading) * len;
      points.push(new THREE.Vector3(x, 0, z));
    } else if (kind < 0.82) {
      const radius = range(rng, 26, 44);
      const sweep = range(rng, Math.PI / 4, (Math.PI * 2) / 3);
      const turn = rng() < 0.5 ? 1 : -1;
      const steps = 6 + Math.floor(rng() * 4);
      const centerX = x - Math.cos(heading) * radius * turn;
      const centerZ = z + Math.sin(heading) * radius * turn;
      for (let s = 1; s <= steps; s += 1) {
        const a = heading + turn * (s / steps) * sweep;
        x = centerX + Math.cos(a) * radius * turn;
        z = centerZ - Math.sin(a) * radius * turn;
        points.push(new THREE.Vector3(x, 0, z));
      }
      heading += turn * sweep;
    } else {
      const short = range(rng, 18, 32);
      const turn = rng() < 0.5 ? 1 : -1;
      const radius = range(rng, 24, 34);
      const sweep = range(rng, Math.PI / 6, Math.PI / 3);
      x += Math.sin(heading) * short;
      z += Math.cos(heading) * short;
      points.push(new THREE.Vector3(x, 0, z));
      const steps = 4;
      const centerX = x - Math.cos(heading) * radius * turn;
      const centerZ = z + Math.sin(heading) * radius * turn;
      for (let s = 1; s <= steps; s += 1) {
        const a = heading + turn * (s / steps) * sweep;
        x = centerX + Math.cos(a) * radius * turn;
        z = centerZ - Math.sin(a) * radius * turn;
        points.push(new THREE.Vector3(x, 0, z));
      }
      heading += turn * sweep;
      x += Math.sin(heading) * short;
      z += Math.cos(heading) * short;
      points.push(new THREE.Vector3(x, 0, z));
    }
  }
  return points;
}

function buildTechnicalPoints(rng: Rng): THREE.Vector3[] {
  const points: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0)];
  let heading = range(rng, 0, Math.PI * 2);
  let x = 0;
  let z = 0;
  const segmentCount = 10 + Math.floor(rng() * 5);

  for (let i = 0; i < segmentCount; i += 1) {
    const kind = rng();
    if (kind < 0.3) {
      const len = range(rng, 30, 55);
      x += Math.sin(heading) * len;
      z += Math.cos(heading) * len;
      points.push(new THREE.Vector3(x, 0, z));
    } else {
      const radius = range(rng, MIN_CORNER_RADIUS, 36);
      const sweep = range(rng, Math.PI / 3, Math.PI * 0.85);
      const turn = rng() < 0.5 ? 1 : -1;
      const steps = 5 + Math.floor(rng() * 3);
      const centerX = x - Math.cos(heading) * radius * turn;
      const centerZ = z + Math.sin(heading) * radius * turn;
      for (let s = 1; s <= steps; s += 1) {
        const a = heading + turn * (s / steps) * sweep;
        x = centerX + Math.cos(a) * radius * turn;
        z = centerZ - Math.sin(a) * radius * turn;
        points.push(new THREE.Vector3(x, 0, z));
      }
      heading += turn * sweep;
    }
  }
  return points;
}

function closeLoop(points: THREE.Vector3[]): THREE.Vector3[] {
  const closed = points.map((p) => p.clone());
  const last = closed[closed.length - 1];
  const first = closed[0];
  const gap = last.distanceTo(first);
  if (gap > CLOSE_TOLERANCE) {
    closed.push(first.clone());
  } else {
    last.copy(first);
  }
  return closed;
}

function segmentsIntersect2D(
  a1: THREE.Vector3,
  a2: THREE.Vector3,
  b1: THREE.Vector3,
  b2: THREE.Vector3,
): boolean {
  const cross = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);

  const onSegment = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) =>
    Math.min(p.x, r.x) <= q.x + 1e-6 &&
    q.x <= Math.max(p.x, r.x) + 1e-6 &&
    Math.min(p.z, r.z) <= q.z + 1e-6 &&
    q.z <= Math.max(p.z, r.z) + 1e-6;

  const d1 = cross(a1, a2, b1);
  const d2 = cross(a1, a2, b2);
  const d3 = cross(b1, b2, a1);
  const d4 = cross(b1, b2, a2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (Math.abs(d1) < 1e-6 && onSegment(a1, b1, a2)) return true;
  if (Math.abs(d2) < 1e-6 && onSegment(a1, b2, a2)) return true;
  if (Math.abs(d3) < 1e-6 && onSegment(b1, a1, b2)) return true;
  if (Math.abs(d4) < 1e-6 && onSegment(b1, a2, b2)) return true;
  return false;
}

function hasSelfIntersection(points: THREE.Vector3[]): boolean {
  const n = points.length;
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 2; j < n - 1; j += 1) {
      if (i === 0 && j === n - 2) continue;
      if (segmentsIntersect2D(points[i], points[i + 1], points[j], points[j + 1])) {
        return true;
      }
    }
  }
  return false;
}

function estimateMinRadius(curve: THREE.CatmullRomCurve3, steps = 80): number {
  let minRadius = Infinity;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const p0 = curve.getPointAt(t0);
    const p1 = curve.getPointAt(t1);
    const p2 = curve.getPointAt(Math.min(1, t1 + 1 / steps));
    const a = p0.distanceTo(p1);
    const b = p1.distanceTo(p2);
    const c = p0.distanceTo(p2);
    const s = (a + b + c) / 2;
    const areaSq = Math.max(0, s * (s - a) * (s - b) * (s - c));
    const area = Math.sqrt(areaSq);
    if (area < 1e-4) continue;
    const radius = (a * b * c) / (4 * area);
    minRadius = Math.min(minRadius, radius);
  }
  return minRadius;
}

export function resampleTrack(
  curve: THREE.CatmullRomCurve3,
  count: number,
  halfWidth: number,
): { samples: TrackSample[]; length: number } {
  const length = curve.getLength();
  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const position = new THREE.Vector3();
  const samples: TrackSample[] = [];

  for (let i = 0; i < count; i += 1) {
    const t = i / count;
    const s = t * length;
    curve.getPointAt(t, position);
    curve.getTangentAt(t, tangent).normalize();
    normal.crossVectors(up, tangent).normalize();
    if (normal.lengthSq() < 1e-6) normal.set(1, 0, 0);

    samples.push({
      s,
      t,
      position: position.clone(),
      tangent: tangent.clone(),
      normal: normal.clone(),
      halfWidth,
    });
  }
  return { samples, length };
}

function buildControlPoints(layout: TrackLayout, rng: Rng): THREE.Vector3[] {
  if (layout === 'oval') return closeLoop(buildOvalPoints(rng));
  if (layout === 'circuit') return closeLoop(buildCircuitPoints(rng));
  return closeLoop(buildTechnicalPoints(rng));
}

function validateTrack(curve: THREE.CatmullRomCurve3, controlPoints: THREE.Vector3[]): boolean {
  if (controlPoints.length < 6) return false;
  if (hasSelfIntersection(controlPoints)) return false;
  if (estimateMinRadius(curve) < MIN_CORNER_RADIUS) return false;
  if (curve.getLength() < 120) return false;
  return true;
}

export function generateTrack(seed: number): GeneratedTrack {
  let attempt = 0;
  while (attempt < 48) {
    const attemptSeed = seed + attempt * 7919;
    const rng = mulberry32(attemptSeed);
    const layout = pickLayout(rng);
    const controlPoints = buildControlPoints(layout, rng);
    const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'centripetal', 0.5);

    if (!validateTrack(curve, controlPoints)) {
      attempt += 1;
      continue;
    }

    const { samples, length } = resampleTrack(curve, SAMPLE_COUNT, TRACK_HALF_WIDTH);
    const names = TRACK_NAMES[layout];
    const name = names[Math.floor(rng() * names.length)];
    const difficulty = THREE.MathUtils.clamp(length / 280 + controlPoints.length / 40, 0.35, 1);

    return {
      seed: attemptSeed,
      name,
      layout,
      controlPoints,
      samples,
      length,
      width: TRACK_HALF_WIDTH * 2,
      difficulty,
    };
  }

  const fallbackRng = mulberry32(seed);
  const layout: TrackLayout = 'oval';
  const controlPoints = closeLoop(buildOvalPoints(fallbackRng));
  const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'centripetal', 0.5);
  const { samples, length } = resampleTrack(curve, SAMPLE_COUNT, TRACK_HALF_WIDTH);
  return {
    seed,
    name: 'Safe Oval',
    layout,
    controlPoints,
    samples,
    length,
    width: TRACK_HALF_WIDTH * 2,
    difficulty: 0.4,
  };
}

export function createTrackCurve(track: GeneratedTrack): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    track.controlPoints.map((p) => p.clone()),
    true,
    'centripetal',
    0.5,
  );
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

export function parseRaceSeedFromUrl(): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('seed');
  if (raw && /^\d+$/.test(raw)) return Number(raw);
  if (params.has('daily')) {
    const day = new Date().toISOString().slice(0, 10);
    let hash = 0;
    for (let i = 0; i < day.length; i += 1) hash = (hash * 31 + day.charCodeAt(i)) >>> 0;
    return hash;
  }
  return randomSeed();
}
