import { describe, expect, it } from 'vitest';
import { generateTrack, createTrackCurve } from '../../src/track/TrackGenerator';
import { buildTrackMeshes } from '../../src/track/TrackMeshBuilder';

describe('track generator', () => {
  it('creates deterministic closed loops from seed', () => {
    const a = generateTrack(42);
    const b = generateTrack(42);
    const c = generateTrack(99);

    expect(a.name).toBe(b.name);
    expect(a.layout).toBe(b.layout);
    expect(a.length).toBeCloseTo(b.length, 4);
    expect(a.samples.length).toBe(256);
    expect(a.controlPoints.length).toBeGreaterThan(6);
    expect(c.seed).not.toBe(a.seed);
  });

  it('produces a drivable spline length and monotonic arc samples', () => {
    const track = generateTrack(228);
    const curve = createTrackCurve(track);
    expect(curve.getLength()).toBeGreaterThan(120);
    expect(curve.getLength()).toBeCloseTo(track.length, 3);

    for (let i = 1; i < track.samples.length; i += 1) {
      expect(track.samples[i].s).toBeGreaterThanOrEqual(track.samples[i - 1].s);
    }
  });

  it('keeps samples on the ground plane', () => {
    const track = generateTrack(512);
    for (const sample of track.samples) {
      expect(sample.position.y).toBe(0);
      expect(sample.tangent.y).toBeCloseTo(0, 5);
    }
  });

  it('produces varied random race maps instead of falling back to Safe Oval', () => {
    const tracks = Array.from({ length: 16 }, (_, index) => generateTrack(index + 1));
    const names = new Set(tracks.map((track) => track.name));
    const layouts = new Set(tracks.map((track) => track.layout));
    const fallbackCount = tracks.filter((track) => track.name === 'Safe Oval').length;

    expect(names.size).toBeGreaterThan(3);
    expect(layouts.size).toBeGreaterThan(1);
    expect(fallbackCount).toBeLessThan(4);
  });
});

describe('track mesh builder', () => {
  it('builds ribbon geometry without NaN vertices', () => {
    const track = generateTrack(228);
    const meshes = buildTrackMeshes(track);
    const pos = meshes.asphalt.geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(100);
    for (let i = 0; i < pos.count; i += 1) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);
    }
  });

  it('maintains consistent track width across samples', () => {
    const track = generateTrack(77);
    const halfWidth = track.width / 2;
    for (const sample of track.samples) {
      expect(sample.halfWidth).toBeCloseTo(halfWidth, 5);
    }
  });
});
